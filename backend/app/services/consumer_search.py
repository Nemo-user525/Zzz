"""Bounded public search adapter. No login bypass, private URLs or invented hits.

360 is a public webpage adapter, not a contracted API. Tavily is optional.
Search snippets and fetched text remain unverified; dates are not inferred.
"""
import asyncio
import hashlib
import html
import ipaddress
import os
import re
import socket
from datetime import datetime, timezone
from urllib.parse import urlparse, urljoin
import httpx
from app.schemas.consumer import Evidence, Step

GATE = asyncio.Semaphore(6)
HEADERS = {'User-Agent': 'XRayEvidenceResearch/1.0'}


def now():
    return datetime.now(timezone.utc).isoformat()


def clean(value):
    value = re.sub(r'<(script|style)\b[^>]*>.*?</\1>', '', value, flags=re.S | re.I)
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', value))).strip()


def navigation_excerpt(text):
    """An enterprise directory's tabs are not evidence of actual events."""
    return sum(word in text for word in ('变更记录', '专利信息', '股东信息', '控股企业', '企业年报', '经营异常', '抽查检查', '软件著作权', '分支机构', '失信人')) >= 5


def signal_matches(source, pattern):
    if navigation_excerpt(source.excerpt):
        return False
    text = re.sub(r'变更记录|行政处罚记录|行政处罚信息|经营异常记录', '', source.title + ' ' + source.excerpt)
    return bool(re.search(pattern, text))


def safe_link(url):
    try:
        p = urlparse(url)
        if p.scheme not in {'https', 'http'} or not p.hostname or p.username or p.password or p.port not in {None, 80, 443}:
            return False
        if p.hostname.lower() == 'localhost' or p.hostname.lower().endswith(('.local', '.internal')):
            return False
        try:
            return ipaddress.ip_address(p.hostname).is_global
        except ValueError:
            return '.' in p.hostname
    except ValueError:
        return False


def classify(url):
    host = urlparse(url).hostname or ''
    if host.endswith('.gov.cn') or host.endswith('.court.gov.cn'):
        return 'government'
    if any(host == d or host.endswith('.' + d) for d in ('xiaohongshu.com', 'weibo.com', 'zhihu.com', 'douyin.com')):
        return 'community'
    return 'public_web'


def make_source(title, url, excerpt, purpose):
    if not safe_link(url) or not title or not excerpt:
        return None
    # Generic search/marketing landing pages do not prove an entity mapping.
    p = urlparse(url)
    if p.hostname in {'www.so.com', 'map.360.cn'} or (p.hostname in {'www.qcc.com', 'www.tianyancha.com'} and p.path in {'', '/'}):
        return None
    return Evidence(id=hashlib.sha256(url.encode()).hexdigest()[:20], title=title[:240], url=url,
                    publisher=p.hostname or '', excerpt=excerpt[:480], fetched_at=now(), purpose=purpose, channel=classify(url))


def parse_360(text, purpose):
    found = []
    for item in re.findall(r'<li\b[^>]*class="[^"]*res-list[^>]*>(.*?)</li>', text, flags=re.S):
        heading = re.search(r'<h3\b[^>]*>(.*?)</h3>', item, re.S)
        if not heading:
            continue
        link = re.search(r'data-mdurl=["\'](.*?)["\']', heading[1], re.S)
        if not link:
            continue
        desc = re.search(r'<p\b[^>]*class="[^"]*res-desc[^>]*>(.*?)</p>', item, re.S)
        if not desc:
            continue
        source = make_source(clean(heading[1]), html.unescape(link[1]), clean(desc[1]), purpose)
        if source:
            found.append(source)
    return found[:8]


async def search(query, purpose):
    """A failed/blocked provider never becomes an empty successful response."""
    async with GATE:
        try:
            async with httpx.AsyncClient(timeout=15, trust_env=False, follow_redirects=False, headers=HEADERS) as client:
                key = os.getenv('TAVILY_API_KEY', '').strip()
                if key:
                    r = await client.post('https://api.tavily.com/search', headers={'Authorization': 'Bearer ' + key},
                                          json={'query': query, 'max_results': 8, 'include_answer': False})
                    r.raise_for_status()
                    items = r.json().get('results')
                    if not isinstance(items, list):
                        raise ValueError('schema')
                    rows = [s for i in items if isinstance(i, dict) and (s := make_source(str(i.get('title', '')), str(i.get('url', '')), str(i.get('content', '')), purpose))]
                    provider = 'Tavily API'
                else:
                    async with client.stream('GET', 'https://www.so.com/s', params={'q': query}) as r:
                        r.raise_for_status()
                        data = b''
                        async for chunk in r.aiter_bytes():
                            data += chunk
                            if len(data) > 2_000_000:
                                raise ValueError('size')
                    text = data.decode('utf-8', errors='replace')
                    if 'res-list' not in text:
                        raise ValueError('blocked_or_changed')
                    rows = parse_360(text, purpose)
                    provider = '360 公开网页'
                return rows, Step(action=purpose, status='completed', detail=f'{provider}：{query}；返回 {len(rows)} 条可解析线索', source_ids=[r.id for r in rows])
        except (httpx.HTTPError, ValueError, KeyError):
            return [], Step(action=purpose, status='failed', detail=f'查询“{query}”失败、受限或页面结构已变化；不能据此认定无记录')


async def public_addresses(host, port):
    addresses = await asyncio.to_thread(socket.getaddrinfo, host, port, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(x[4][0]).is_global for x in addresses):
        raise ValueError('private_address')


async def read_page(source):
    """Recheck every redirect; never send credentials to discovered URLs."""
    url = source.url
    try:
        async with GATE, httpx.AsyncClient(timeout=8, trust_env=False, follow_redirects=False, headers=HEADERS) as client:
            for _ in range(4):
                if not safe_link(url):
                    raise ValueError('unsafe_url')
                p = urlparse(url)
                await public_addresses(p.hostname, p.port or (443 if p.scheme == 'https' else 80))
                async with client.stream('GET', url) as r:
                    if r.is_redirect:
                        url = urljoin(url, r.headers.get('location', ''))
                        continue
                    r.raise_for_status()
                    if 'text/html' not in r.headers.get('content-type', ''):
                        raise ValueError('not_html')
                    data = b''
                    async for chunk in r.aiter_bytes():
                        data += chunk
                        if len(data) > 1_000_000:
                            raise ValueError('size')
                raw = data.decode('utf-8', errors='replace')
                if any(x in raw[:10000] for x in ('安全验证', '访问验证', '验证码', '百度安全验证')):
                    raise ValueError('verification_required')
                text = clean(raw)[:24000]
                if len(text) < 80:
                    raise ValueError('empty_or_dynamic')
                source.page_status = '已读取网页文本；尚未核实内容真实性'
                source.sha256 = hashlib.sha256(data).hexdigest()
                # Keep search snippet separate unless an exact excerpt can be located.
                return text
    except (httpx.HTTPError, ValueError, OSError):
        pass
    source.page_status = '未取得可用正文，保留搜索摘要；可手动打开原文'
    return ''


def relevant(source, keyword):
    tokens = [t for t in re.split(r'\s+', keyword) if t]
    text = re.sub(r'\s+', '', source.title + source.excerpt).lower()
    return all(re.sub(r'\s+', '', t).lower() in text for t in tokens)


def dedupe(rows):
    result = {}
    for row in rows:
        if row.id not in result:
            result[row.id] = row
    return list(result.values())
