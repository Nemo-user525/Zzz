"""Public CNINFO adapter. Discovery is not evidence verification."""
from datetime import datetime, timedelta, timezone
import hashlib
import ipaddress
import os
import re
import socket
import time
from urllib.parse import urlparse
import httpx

HOSTS = {'www.cninfo.com.cn', 'static.cninfo.com.cn'}
MAX_BYTES = 20 * 1024 * 1024
CN = timezone(timedelta(hours=8))


def safe_url(url):
    p = urlparse(url)
    if p.scheme != 'https' or p.hostname not in HOSTS or p.username or p.password or p.port not in (None, 443):
        raise ValueError('仅支持已许可的巨潮 HTTPS 地址')
    for info in socket.getaddrinfo(p.hostname, 443, type=socket.SOCK_STREAM):
        if not ipaddress.ip_address(info[4][0]).is_global:
            raise ValueError('拒绝非公网目标')
    return url


class Cninfo:
    def __init__(self):
        self.client = httpx.Client(timeout=20, trust_env=False, follow_redirects=False,
                                   headers={'User-Agent': 'XRayResearch/2.0 (bounded public disclosure research)', 'Referer': 'https://www.cninfo.com.cn/'})
        self.interval = max(.2, float(os.getenv('INGEST_REQUEST_INTERVAL', '.35')))
        self.last = 0

    def request(self, method, url, **kwargs):
        safe_url(url)
        for attempt in range(3):
            time.sleep(max(0, self.interval - (time.monotonic() - self.last)))
            self.last = time.monotonic()
            try:
                r = self.client.request(method, url, **kwargs)
                if r.status_code in (401, 403, 451):
                    raise PermissionError(f'来源访问受限 HTTP {r.status_code}')
                if r.is_redirect:
                    raise ValueError('未预先授权的重定向；请人工检查来源')
                r.raise_for_status()
                if len(r.content) > MAX_BYTES:
                    raise ValueError('响应超出大小限制')
                return r
            except (httpx.TimeoutException, httpx.NetworkError, httpx.HTTPStatusError):
                if attempt == 2:
                    raise
                time.sleep(.5 * (attempt + 1))

    def catalog(self):
        return self.request('GET', 'https://www.cninfo.com.cn/new/data/szse_stock.json').json()['stockList']

    def announcements(self, stock='', start='2018-01-01', end=None, keyword='', page=1, size=30):
        r = self.request('POST', 'https://www.cninfo.com.cn/new/hisAnnouncement/query', data={
            'pageNum': page, 'pageSize': min(size, 30), 'column': 'szse', 'tabName': 'fulltext',
            'stock': stock, 'seDate': f'{start}~{end or datetime.now(CN).date().isoformat()}', 'searchkey': keyword})
        data = r.json()
        if 'announcements' not in data:
            raise ValueError('来源响应结构变化，停止解析')
        rows = []
        for a in data.get('announcements') or []:
            url = 'https://static.cninfo.com.cn/' + a['adjunctUrl']
            safe_url(url)
            rows.append({'announcement_id': a['announcementId'], 'title': re.sub('<[^>]+>', '', a['announcementTitle']),
                         'ticker': a['secCode'], 'short_name': a['secName'], 'org_id': a['orgId'], 'url': url,
                         'published_at': datetime.fromtimestamp(a['announcementTime'] / 1000, CN).date().isoformat()})
        return rows, bool(data.get('hasMore'))

    def download(self, url):
        safe_url(url)
        for attempt in range(3):
            try:
                return self._download_once(url)
            except (httpx.TimeoutException, httpx.NetworkError, httpx.HTTPStatusError) as exc:
                if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code in (401, 403, 451):
                    raise PermissionError(f'来源访问受限 HTTP {exc.response.status_code}') from exc
                if attempt == 2: raise
                time.sleep(.5 * (attempt + 1))

    def _download_once(self, url):
        time.sleep(self.interval)
        # Stream before buffering: reject large files and all redirects.
        with self.client.stream('GET', url) as r:
            if r.is_redirect:
                raise ValueError('下载重定向未授权')
            r.raise_for_status()
            content = bytearray()
            for block in r.iter_bytes(65536):
                content.extend(block)
                if len(content) > MAX_BYTES:
                    raise ValueError('PDF 超过 20 MiB 限制')
        if not content.startswith(b'%PDF-'):
            raise ValueError('来源未返回 PDF，可能需登录或验证')
        return bytes(content), hashlib.sha256(content).hexdigest()
