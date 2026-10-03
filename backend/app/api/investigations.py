"""Live, source-labelled web leads for an arbitrary user keyword.

This endpoint does not resolve a shop to a legal entity or rate its risk.  It
returns the search provider's actual response and makes unavailable sources
explicit, so the consumer UI can never mistake cached demo data for a lookup.
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from html import unescape
import re
from urllib.parse import urlsplit
from xml.etree import ElementTree

import httpx
from fastapi import APIRouter
from pydantic import BaseModel, Field


router = APIRouter(prefix="/api")
SEARCH_URL = "https://news.google.com/rss/search"
COMPANY_NAME = re.compile(r"[\u4e00-\u9fa5A-Za-z0-9（）()·]{2,48}(?:有限责任公司|股份有限公司|有限公司)")


class InvestigationInput(BaseModel):
    query: str = Field(min_length=2, max_length=100)
    city: str = Field(default="", max_length=40)
    intent: str = Field(default="look_around", pattern="^(initial_purchase|add_value|renewal|look_around)$")
    amount_yuan: float | None = Field(default=None, ge=0)
    service_duration_months: int | None = Field(default=None, ge=1, le=240)


def _clean(value: str) -> str:
    return re.sub(r"<[^>]*>", "", unescape(value or "")).strip()


def _relevant(keyword: str, content: str) -> bool:
    compact = re.sub(r"\s+", "", keyword).lower()
    haystack = re.sub(r"\s+", "", content).lower()
    if compact in haystack:
        return True
    # Brand names often appear with a different category word in news. A
    # short prefix is only a retrieval heuristic, never an identity match.
    return len(compact) >= 4 and compact[:2] in haystack


def _fetch(query: str, keyword: str) -> list[dict]:
    response = httpx.get(
        SEARCH_URL,
        params={"q": query, "hl": "zh-CN", "gl": "CN", "ceid": "CN:zh-Hans"},
        headers={"User-Agent": "Mozilla/5.0 (compatible; X-Ray/2.0; public RSS search)"},
        follow_redirects=True,
        timeout=12,
    )
    response.raise_for_status()
    root = ElementTree.fromstring(response.content)
    items = []
    for item in root.findall("./channel/item"):
        title = _clean(item.findtext("title") or "")
        url = (item.findtext("link") or "").strip()
        snippet = _clean(item.findtext("description") or "")[:500]
        if not title or urlsplit(url).scheme not in {"https", "http"} or not _relevant(keyword, title + " " + snippet):
            continue
        items.append({
            "title": title,
            "url": url,
            "snippet": snippet,
            "published_at": item.findtext("pubDate"),
            "search_query": query,
        })
        if len(items) >= 8:
            break
    return items


@router.post("/investigations")
def investigate(inp: InvestigationInput):
    # A search result is a lead. It is never a verified event or a confirmed
    # shop-to-company mapping, even when a legal name occurs in a snippet.
    keyword = inp.query.strip()
    city = inp.city.strip()
    search_queries = [" ".join(p for p in (keyword, city) if p)]
    search_queries.append(" ".join(p for p in (keyword, city, "经营主体 公司") if p))
    queried_at = datetime.now(timezone.utc).isoformat()
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda term: _safe_fetch(term, keyword), search_queries))

    leads: list[dict] = []
    seen: set[str] = set()
    failures = []
    for term, (items, error) in zip(search_queries, results):
        if error:
            failures.append({"query": term, "message": error})
        for item in items:
            if item["url"] in seen:
                continue
            seen.add(item["url"])
            leads.append({"id": f"web-{len(leads)+1}", **item, "provider": "Google 新闻 RSS", "verification_status": "search_lead"})

    candidates: dict[str, list[str]] = {}
    for lead in leads:
        for name in COMPANY_NAME.findall(lead["title"] + " " + lead["snippet"]):
            candidates.setdefault(name, []).append(lead["id"])

    if leads:
        status = "leads_found"
    elif len(failures) == len(search_queries):
        status = "source_unavailable"
    else:
        status = "no_results"
    return {
        "query": keyword,
        "city": city,
        "queried_at": queried_at,
        "status": status,
        "identity_status": "unconfirmed",
        "leads": leads,
        "candidates": [{"name": name, "source_ids": ids, "status": "unconfirmed"} for name, ids in list(candidates.items())[:5]],
        "coverage": [
            {"name": "公开新闻搜索", "status": "queried" if len(failures) < len(search_queries) else "unavailable", "detail": f"本次获取 {len(leads)} 条相关搜索线索"},
            {"name": "企查查企业数据", "status": "not_connected", "detail": "尚未配置授权接口"},
            {"name": "小红书公开内容", "status": "not_connected", "detail": "尚未配置可用接口"},
        ],
        "trace": [
            {"step": "查询公开新闻源", "detail": f"发起 {len(search_queries)} 次查询，返回 {len(leads)} 条相关且去重的线索", "at": queried_at},
            {"step": "经营主体核对", "detail": "网页名称仅作候选；门店与法定主体的关系尚未确认", "at": queried_at},
        ],
        "failures": failures,
        "training_model": {"status": "unavailable", "version": None, "detail": "当前仓库尚无可验证的历史训练产物"},
        "agent": {"status": "not_connected", "detail": "本次只执行公开新闻检索；智能体追加核查尚未接入"},
    }


def _safe_fetch(query: str, keyword: str) -> tuple[list[dict], str | None]:
    try:
        return _fetch(query, keyword), None
    except (httpx.HTTPError, ElementTree.ParseError, ValueError) as exc:
        return [], f"公开搜索源请求失败：{type(exc).__name__}"
