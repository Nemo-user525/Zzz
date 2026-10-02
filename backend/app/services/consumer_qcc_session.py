"""An operator's QCC web session, restricted to normal company-detail GETs."""
import asyncio
import hashlib
import json
import os
import re
from pathlib import Path
from urllib.parse import urlsplit
import httpx

GATE = asyncio.Semaphore(1)
BUNDLED_SESSION = Path(__file__).resolve().parents[3] / 'configs' / 'qcc-web-session.json'
session_cookie = None
last_status = 'not_configured'
last_http_status = None
last_error_code = None


def cookie():
    if session_cookie is not None:
        return session_cookie
    value = os.getenv('QCC_WEB_COOKIE','').strip()
    if value:
        return value
    try:
        value = json.loads(BUNDLED_SESSION.read_text(encoding='utf-8')).get('cookie','')
    except (OSError, UnicodeError, ValueError, AttributeError):
        return ''
    return value.strip() if valid_cookie(value) else ''


def valid_cookie(value):
    return isinstance(value,str) and len(value)<=16384 and all(32<=ord(c)<=126 for c in value) and (not value or '=' in value)


def configure(value):
    global session_cookie, last_status, last_http_status, last_error_code
    if not valid_cookie(value):
        raise ValueError('Cookie 格式无效，请复制请求头 Cookie 的值。')
    session_cookie=value.strip()
    last_status='ready' if session_cookie else 'not_configured'
    last_http_status=last_error_code=None


def status():
    return {'configured':bool(cookie()), 'status':last_status if last_status!='not_configured' or not cookie() else 'ready', 'http_status':last_http_status, 'error_code':last_error_code}


def company_page(url):
    try:
        p=urlsplit(url)
        return p.scheme=='https' and p.hostname=='www.qcc.com' and not p.username and not p.password and p.port in (None,443) and not p.query and not p.fragment and bool(re.fullmatch(r'/firm/[a-fA-F0-9]{32}\.html',p.path))
    except ValueError:return False


async def read(source):
    from app.services import consumer_search as web
    global last_status, last_http_status, last_error_code
    last_error_code=None
    if not company_page(source.url):return ''
    headers=dict(web.HEADERS)
    secret=cookie()
    if secret:headers['Cookie']=secret
    try:
        await web.public_addresses('www.qcc.com',443)
        async with GATE, httpx.AsyncClient(timeout=12,trust_env=False,follow_redirects=False) as client:
            async with client.stream('GET',source.url,headers=headers) as response:
                last_http_status=response.status_code
                if response.status_code==403:
                    last_status='access_denied'
                    source.page_status='企查查拒绝网页访问；可能涉及账户权限、会话校验或网站访问策略，不能仅凭此断言 Cookie 失效。'
                    return ''
                if response.status_code==401 or (response.is_redirect and 'login' in response.headers.get('location','').lower()):
                    last_status='login_required'
                    source.page_status='企查查网页会话需要登录或已失效，请在本机弹窗更新本人 Cookie。'
                    return ''
                if response.status_code in (405,429):
                    last_status='rate_limited'
                    source.page_status='企查查限制访问频率；本次未读取正文，其他来源继续调查。'
                    return ''
                response.raise_for_status()
                if 'text/html' not in response.headers.get('content-type',''):raise ValueError('not_html')
                data=b''
                async for chunk in response.aiter_bytes():
                    data+=chunk
                    if len(data)>1_000_000:raise ValueError('too_large')
        raw=data.decode('utf-8',errors='replace')
        if any(term in raw[:20000] for term in ('访问超频','安全验证','访问验证','验证码')):
            last_status='rate_limited'
            source.page_status='企查查要求人工验证或限制访问；未自动重试，其他来源继续调查。'
            return ''
        if any(term in raw[:20000] for term in ('请登录后','登录后可查看')):
            last_status='login_required'
            source.page_status='企查查要求登录后查看，请在本机弹窗更新本人 Cookie。'
            return ''
        text=web.clean(raw)[:24000]
        if len(text)<80:raise ValueError('dynamic_or_empty')
        last_status='accessible'
        source.sha256=hashlib.sha256(data).hexdigest()
        source.page_status='已使用本人网页会话读取正文；非官方 API 核验，内容仍待核对。' if secret else '已读取企查查公开正文；内容仍待核对。'
        return text
    except (httpx.HTTPError,ValueError,OSError) as exc:
        last_error_code=str(exc) if type(exc) is ValueError and str(exc) in {'not_html','too_large','dynamic_or_empty'} else type(exc).__name__
        last_status='unavailable'
        source.page_status='企查查返回动态页面或无可用正文，保留搜索摘要。' if last_error_code=='dynamic_or_empty' else '企查查网页正文暂不可用，保留搜索摘要。'
        return ''
