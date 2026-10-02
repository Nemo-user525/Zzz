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
from xml.etree import ElementTree
from datetime import datetime, timezone, date
from urllib.parse import urlparse, urljoin, parse_qsl, urlencode, urlunparse
from collections import defaultdict, deque
import httpx
from app.schemas.consumer import Evidence, Step

GATE = asyncio.Semaphore(6)
HEADERS = {'User-Agent': 'XRayEvidenceResearch/1.0'}


def now():
    return datetime.now(timezone.utc).isoformat()


def clean(value):
    value = re.sub(r'<(script|style)\b[^>]*>.*?</\1>', '', value, flags=re.S | re.I)
    value = re.sub(r'</?(?:em|b|strong|span|i)\b[^>]*>', '', value, flags=re.I)
    value = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', value))).strip()
    return re.sub(r'(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])', '', value)


def navigation_excerpt(text):
    """An enterprise directory's tabs are not evidence of actual events."""
    return sum(word in text for word in ('变更记录', '专利信息', '股东信息', '控股企业', '企业年报', '经营异常', '抽查检查', '软件著作权', '分支机构', '失信人')) >= 5


def aggregation_page(url):
    p=urlparse(url)
    return (p.hostname or '').removeprefix('www.')=='toutiao.com' and p.path.startswith(('/topic/','/search/','/keyword/'))


def signal_matches(source, pattern):
    if navigation_excerpt(source.excerpt):
        return False
    text = re.sub(r'变更记录|行政处罚记录|行政处罚信息|经营异常记录', '', source.title + ' ' + source.excerpt)
    return bool(re.search(pattern, text))


def ground_quote(quote, excerpt):
    """Restore only whitespace omitted by a model; never fuzzy-match words or punctuation."""
    if quote in excerpt:
        return quote
    positions = [i for i, char in enumerate(excerpt) if not char.isspace()]
    compact = ''.join(excerpt[i] for i in positions)
    target = ''.join(char for char in quote if not char.isspace())
    start = compact.find(target) if len(target) >= 4 else -1
    if start < 0:
        raise ValueError('unsupported_citation')
    result = excerpt[positions[start]:positions[start+len(target)-1]+1]
    if len(result)>480:
        raise ValueError('citation_too_long')
    return result


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
    if any(host == d or host.endswith('.' + d) for d in ('xiaohongshu.com', 'weibo.com', 'weibo.cn', 'zhihu.com', 'douyin.com', 'douban.com', 'tieba.baidu.com', 'bilibili.com', 'tousu.sina.com.cn', 'tousu.sina.cn', 'dianping.com', 'meituan.com', 'tousu.315cons.com', 'xfb315.com', '315tech.com')):
        return 'community'
    return 'public_web'


def canonical_url(url):
    p = urlparse(url)
    query = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True)
             if not k.lower().startswith('utm_') and k.lower() not in {'spm', 'from', 'source', 'share_token', 'xsec_token', 'xsec_source'}]
    return urlunparse((p.scheme.lower(), p.netloc.lower(), p.path or '/', p.params, urlencode(sorted(query)), ''))


def publisher_key(url):
    host = (urlparse(url).hostname or '').removeprefix('www.')
    for domain in ('sina.com.cn', 'gov.cn', 'baidu.com'):
        if host.endswith(domain):
            return host if domain == 'gov.cn' else domain
    parts = host.split('.')
    return '.'.join(parts[-3:] if host.endswith('.com.cn') else parts[-2:])


def diverse(rows, limit=160, per_publisher=20):
    """Round-robin websites so one directory cannot consume the evidence budget."""
    groups = defaultdict(deque)
    for row in dedupe(rows):
        groups[publisher_key(row.url)].append(row)
    result, counts = [], defaultdict(int)
    while groups and len(result) < limit:
        for host in list(groups):
            if len(result) >= limit:
                break
            if groups[host] and counts[host] < per_publisher:
                result.append(groups[host].popleft())
                counts[host] += 1
            if not groups[host] or counts[host] >= per_publisher:
                del groups[host]
    return result


def make_source(title, url, excerpt, purpose):
    if not safe_link(url) or not title or not excerpt:
        return None
    if re.fullmatch(r'\d{4}年\d{1,2}月\d{1,2}日\s*[-—]?\s*', excerpt):
        return None  # A date-only result has no usable content to show or assess.
    # Generic search/marketing landing pages do not prove an entity mapping.
    p = urlparse(url)
    if p.hostname in {'www.so.com', 'map.360.cn'} or (p.hostname in {'www.qcc.com', 'www.tianyancha.com'} and p.path in {'', '/'}):
        return None
    published = None
    marked = re.match(r'^(\d{4})年(\d{1,2})月(\d{1,2})日\s*[-—]', excerpt)
    if marked:
        try:
            parsed = date(*map(int, marked.groups()))
            if parsed <= datetime.now(timezone.utc).date():
                published = parsed.isoformat()
        except ValueError:
            pass
    return Evidence(id=hashlib.sha256(url.encode()).hexdigest()[:20], title=title[:240], url=url,
                    publisher=p.hostname or '', excerpt=excerpt[:480], fetched_at=now(), purpose=purpose, channel=classify(url),
                    published_at=published, date_semantics='搜索引擎标注日期，未核实发表日；不等于事件日' if published else '公开日期未核实')


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
    return found[:12]


def parse_sogou(text, purpose):
    headings=list(re.finditer(r'<h3\b[^>]*class="[^"]*vr-title[^"]*"[^>]*>(.*?)</h3>',text,re.S))
    rows=[]
    for index,heading in enumerate(headings):
        block=text[heading.end():headings[index+1].start() if index+1<len(headings) else heading.end()+14000]
        direct=re.search(r'href="(https?://[^"]+)"',heading[1])
        real=re.search(r'data-url="(https?://[^"]+)"',block)
        target=direct or real
        if not target:continue  # Never invent a destination from a shortened display URL.
        url=html.unescape(target[1])
        if (urlparse(url).hostname or '').endswith('sogou.com'):continue
        summary=re.search(r'<div\b[^>]*class="[^"]*fz-mid[^"]*"[^>]*>(.*?)</div>',block,re.S)
        if not summary:summary=re.search(r'<div\b[^>]*class="[^"]*attribute-list[^"]*"[^>]*>(.*?)</ul>',block,re.S)
        if not summary:continue
        excerpt=clean(summary[1])
        marked=re.search(r'<span[^>]*>(\d{4})-(\d{2})-(\d{2})</span>',block)
        if marked:excerpt=f'{marked[1]}年{int(marked[2])}月{int(marked[3])}日 - '+excerpt
        row=make_source(clean(heading[1]),url,excerpt,purpose)
        if row:rows.append(row)
    return rows[:15]


async def search_provider(query, purpose, provider='public', page=1):
    """A failed/blocked provider never becomes an empty successful response."""
    async with GATE:
        try:
            async with httpx.AsyncClient(timeout=15, trust_env=False, follow_redirects=False, headers=HEADERS) as client:
                key = os.getenv('TAVILY_API_KEY', '').strip()
                if provider == 'tavily' and key:
                    r = await client.post('https://api.tavily.com/search', headers={'Authorization': 'Bearer ' + key},
                                          json={'query': query, 'max_results': 15, 'search_depth': 'advanced', 'include_answer': False})
                    r.raise_for_status()
                    items = r.json().get('results')
                    if not isinstance(items, list):
                        raise ValueError('schema')
                    rows = [s for i in items if isinstance(i, dict) and (s := make_source(str(i.get('title', '')), str(i.get('url', '')), str(i.get('content', '')), purpose))]
                    provider = 'Tavily API'
                elif provider == 'bocha':
                    r = await client.post('https://api.bocha.cn/v1/web-search',
                        headers={'Authorization': 'Bearer ' + os.environ['BOCHA_API_KEY']},
                        json={'query': query, 'count': 20, 'summary': True})
                    r.raise_for_status()
                    items = r.json()['data']['webPages']['value']
                    rows = [s for i in items if (s := make_source(i.get('name', ''), i.get('url', ''), i.get('summary') or i.get('snippet', ''), purpose))]
                    provider = '博查 API'
                elif provider == 'sogou':
                    async with client.stream('GET','https://www.sogou.com/web',params={'query':query}) as r:
                        r.raise_for_status()
                        data=b''
                        async for chunk in r.aiter_bytes():
                            data+=chunk
                            if len(data)>2_000_000:raise ValueError('size')
                    text=data.decode('utf-8',errors='replace')
                    if 'vr-title' not in text or any(word in text[:12000] for word in ('验证码','访问验证','安全验证')):
                        raise ValueError('blocked_or_changed')
                    rows=parse_sogou(text,purpose)
                    provider='搜狗公开网页'
                elif provider == 'bing':
                    async with client.stream('GET', 'https://cn.bing.com/search', params={'q': query, 'format': 'rss', 'count': 15}) as r:
                        r.raise_for_status()
                        data = b''
                        async for chunk in r.aiter_bytes():
                            data += chunk
                            if len(data) > 2_000_000:
                                raise ValueError('size')
                    feed = ElementTree.fromstring(data)
                    if feed.tag != 'rss':
                        raise ValueError('not_rss')
                    rows = [s for item in feed.findall('./channel/item') if (s := make_source(
                        clean(item.findtext('title', '')), item.findtext('link', ''), clean(item.findtext('description', '')), purpose))]
                    provider = 'Bing 公开搜索 RSS'
                else:
                    async with client.stream('GET', 'https://www.so.com/s', params={'q': query, **({'pn': page} if page > 1 else {})}) as r:
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
                    provider = f'360 公开网页第 {page} 页'
                return rows, Step(action=purpose, status='completed', detail=f'{provider}：{query}；返回 {len(rows)} 条可解析线索', source_ids=[r.id for r in rows])
        except (httpx.HTTPError, ValueError, KeyError, TypeError, ElementTree.ParseError):
            return [], Step(action=purpose, status='failed', detail=f'查询“{query}”失败、受限或页面结构已变化；不能据此认定无记录')


async def search(query, purpose):
    providers = [('public', 1), ('public', 2), ('bing', 1), ('sogou',1)]
    if os.getenv('TAVILY_API_KEY', '').strip():
        providers.append(('tavily', 1))
    if os.getenv('BOCHA_API_KEY', '').strip():
        providers.append(('bocha', 1))
    pairs = await asyncio.gather(*(search_provider(query, purpose, p, page) for p, page in providers))
    rows = dedupe([s for items, _ in pairs for s in items])
    completed = sum(step.status == 'completed' for _, step in pairs)
    return rows, Step(action=purpose, status='completed' if completed else 'failed',
        detail=f'{query}；{completed}/{len(pairs)} 个检索请求成功，去重后 {len(rows)} 条线索' +
               ('；部分渠道失败，不能据此认定没有记录' if completed < len(pairs) else ''),
        source_ids=[s.id for s in rows])


async def public_addresses(host, port):
    addresses = await asyncio.to_thread(socket.getaddrinfo, host, port, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(x[4][0]).is_global for x in addresses):
        raise ValueError('private_address')


async def read_page(source):
    """Recheck every redirect; never send credentials to discovered URLs."""
    url = source.url
    from app.services import consumer_qcc_session
    if source.purpose == '企查查网页导入':return ''
    if consumer_qcc_session.company_page(url):
        return await consumer_qcc_session.read(source)
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
        # API groups share a documentation URL, but represent different records.
        key = row.id if row.channel == 'registry' else canonical_url(row.url)
        if key not in result:
            result[key] = row
    return list(result.values())
