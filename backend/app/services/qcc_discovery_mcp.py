"""Qichacha Agent MCP for the store lookup and the unabridged company report."""

import asyncio
import json
import re
from datetime import datetime, timezone, timedelta
from typing import Any

import httpx

from app.services.consumer_qcc_mcp import credentials
from app.services.qcc_discovery_risk import assess


COMPANY_URL = "https://agent.qcc.com/mcp/company/stream"
RISK_URL = "https://agent.qcc.com/mcp/risk/stream"
COMPANY_DETAILS = {
    "get_company_profile": "企业概况",
    "get_shareholder_info": "股东信息",
    "get_key_personnel": "主要人员",
    "get_actual_controller": "实际控制人",
    "get_beneficial_owners": "受益所有人",
    "get_branches": "分支机构",
    "get_external_investments": "对外投资",
    "get_change_records": "工商变更",
    "get_annual_reports": "企业年报",
    "get_financial_data": "财务数据",
    "get_listing_info": "上市信息",
    "get_tax_invoice_info": "税务发票信息",
    "get_contact_info": "企业联系方式",
}


class QccUnavailable(Exception):
    pass


def configured() -> bool:
    return bool(credentials()[1])


def _response_data(result: Any) -> dict[str, Any]:
    if result.isError:
        raise QccUnavailable("企查查智能体未完成本次查询，请检查接口权限或额度")
    data = result.structuredContent
    if data is None:
        try:
            data = json.loads("\n".join(part.text for part in result.content if part.type == "text"))
        except (ValueError, TypeError) as exc:
            raise QccUnavailable("企查查智能体返回的资料无法解析") from exc
    if not isinstance(data, dict) or data.get("isError") or data.get("error") or data.get("success") is False:
        raise QccUnavailable("企查查智能体没有返回可用资料")
    return data


async def _call_many(server: str, query: str, names: list[str]) -> dict[str, dict[str, Any]]:
    """Call only offered, fixed read-only tools; keep every successful field intact."""
    _, key = credentials()
    if not key:
        raise QccUnavailable("尚未配置企查查智能体 API Key")
    try:
        from mcp import ClientSession
        from mcp.client.streamable_http import streamablehttp_client

        url = COMPANY_URL if server == "company" else RISK_URL if server == "risk" else None
        if url is None:
            raise ValueError("Unknown QCC server")
        outcomes: dict[str, dict[str, Any]] = {}
        async with asyncio.timeout(125):
            async with streamablehttp_client(
                url,
                headers={"Authorization": "Bearer " + key},
                timeout=timedelta(seconds=25),
                httpx_client_factory=lambda **kwargs: httpx.AsyncClient(
                    **kwargs, trust_env=False, follow_redirects=False
                ),
            ) as (read, write, _):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    offered = {tool.name: tool for tool in (await session.list_tools()).tools}
                    for name in names:
                        tool = offered.get(name)
                        schema = tool.inputSchema if tool else {}
                        if (not name.startswith("get_") or
                            schema.get("properties", {}).get("searchKey", {}).get("type") != "string" or
                            set(schema.get("required", [])) - {"searchKey"}):
                            outcomes[name] = {"status": "failed", "message": "接口未提供兼容的查询工具"}
                            continue
                        try:
                            data = _response_data(await session.call_tool(name, arguments={"searchKey": query}))
                        except Exception:
                            outcomes[name] = {"status": "failed", "message": "企查查智能体未返回可用资料"}
                        else:
                            outcomes[name] = {"status": "returned", "data": data}
        return outcomes
    except QccUnavailable:
        raise
    except Exception as exc:
        raise QccUnavailable("企查查智能体连接失败或查询超时，请稍后重试") from exc


def _company_rows(data: dict[str, Any]) -> list[dict[str, str]]:
    info = data.get("企业信息")
    rows = info if isinstance(info, list) else [info] if isinstance(info, dict) else []
    companies = []
    seen = set()
    for item in rows:
        name = str(item.get("企业名称") or "").strip()
        credit = str(item.get("统一社会信用代码") or "").strip()
        if not name or (name, credit) in seen:
            continue
        seen.add((name, credit))
        companies.append({
            "key_no": credit or name,
            "name": name,
            "credit_code": credit,
            "address": str(item.get("注册地址") or ""),
            "status": str(item.get("状态") or item.get("登记状态") or ""),
            "start_date": str(item.get("成立日期") or ""),
            "provider": "企查查智能体 MCP",
        })
    return companies


def _lookup_terms(keyword: str) -> list[str]:
    terms = [keyword]
    stem = re.split(r"[（(]", keyword, maxsplit=1)[0].strip()
    if stem != keyword and len(stem) >= 2:
        terms.append(stem)
        brand = re.sub(r"(?:私教馆|健身房|健身馆|健身中心|门店|分店|店)$", "", stem).strip()
        if len(brand) >= 2 and brand != stem:
            terms.append(brand)
    return terms


async def search(keyword: str) -> dict[str, Any]:
    for term in _lookup_terms(keyword):
        outcome = (await _call_many("company", term, ["get_company_by_query"]))["get_company_by_query"]
        if outcome["status"] != "returned":
            raise QccUnavailable(outcome["message"])
        companies = _company_rows(outcome["data"])
        if companies:
            return {
                "companies": companies,
                "searched_term": term,
                "search_note": ("已将搜索词扩展为“" + term + "”，以下是可选择的企业。") if term != keyword else "",
            }
    return {"companies": [], "searched_term": keyword, "search_note": "可以试试品牌关键词，或输入合同、营业执照上的企业全称。"}


def _same_company(data: dict[str, Any], name: str, credit: str) -> bool:
    returned_name = data.get("企业名称")
    returned_code = data.get("统一社会信用代码")
    return isinstance(returned_name, str) and returned_name == name and (
        not returned_code or not credit or returned_code == credit
    )


def _section(title: str, tool: str, outcome: dict[str, Any], company: str, credit: str, count: int | None = None) -> dict[str, Any]:
    result: dict[str, Any] = {"title": title, "tool": tool, "status": outcome["status"]}
    if count is not None:
        result["scan_count"] = count
    if outcome["status"] != "returned":
        result["message"] = outcome.get("message", "查询未完成")
    elif not _same_company(outcome["data"], company, credit):
        result.update(status="failed", message="返回主体与所选企业不一致，已排除该明细")
    else:
        result["data"] = outcome["data"]
    return result


async def report(query: str) -> dict[str, Any]:
    core = await _call_many("company", query, ["get_company_registration_info", *COMPANY_DETAILS])
    registration = core["get_company_registration_info"]
    if registration["status"] != "returned":
        raise QccUnavailable("企查查智能体未返回工商登记，无法确认企业身份")
    basic = registration["data"]
    name = basic.get("企业名称")
    credit = str(basic.get("统一社会信用代码") or "")
    if not isinstance(name, str) or not name or (re.fullmatch(r"[A-Z0-9]{18}", query) and credit != query) or (not re.fullmatch(r"[A-Z0-9]{18}", query) and name != query):
        raise QccUnavailable("企查查返回的企业身份与所选主体不一致，请重新核对")

    sections = [_section(title, tool, core[tool], name, credit) for tool, title in COMPANY_DETAILS.items()]
    try:
        scan_outcome = (await _call_many("risk", credit or name, ["get_company_risk_scan"]))["get_company_risk_scan"]
    except QccUnavailable:
        scan_outcome = {"status": "failed", "message": "风险扫描未完成"}
    risk_scan = scan_outcome.get("data") if scan_outcome["status"] == "returned" else None
    if risk_scan and not _same_company(risk_scan, name, credit):
        risk_scan = None
        scan_outcome = {"status": "failed", "message": "风险扫描返回主体不一致"}

    if risk_scan:
        factors = risk_scan.get("风险因子扫描")
        factors = factors if isinstance(factors, list) else []
        details = [(str(row.get("风险因子") or ""), str(row.get("明细工具") or ""), row.get("条目数"))
                   for row in factors if isinstance(row, dict) and isinstance(row.get("条目数"), int) and row["条目数"] > 0]
        names = [tool for _, tool, _ in details if re.fullmatch(r"get_[a-z_]+", tool)]
        try:
            detail_results = await _call_many("risk", credit or name, names) if names else {}
        except QccUnavailable:
            detail_results = {}
        for title, tool, count in details:
            outcome = detail_results.get(tool, {"status": "failed", "message": "企查查未提供该因子的明细工具"})
            sections.append(_section(title, tool, outcome, name, credit, count))

    failures = [s["title"] for s in sections if s["status"] != "returned"]
    if not risk_scan:
        failures.insert(0, "风险扫描")
    result = {
        "provider": "企查查智能体 MCP（企业数据 + 风控）",
        "queried_at": datetime.now(timezone.utc).isoformat(),
        "order_number": "",
        "company_name": name,
        "credit_code": credit,
        "data": basic,
        "risk_scan": risk_scan,
        "sections": sections,
        "failed_sections": failures,
        "coverage_note": "保留本次企查查智能体返回的工商登记、企业资料、风险扫描和已调用明细工具全部原始字段。扫描条目数与明细返回条数可能不同；未提供或查询失败的部分不能当作零风险。此页不等同于企查查平台的全部商业档案。",
    }
    result["assessment"] = assess(result)
    return result
