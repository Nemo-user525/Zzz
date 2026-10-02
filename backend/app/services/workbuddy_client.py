"""WorkBuddy's published Local Assistant OpenAPI; no desktop-private token access."""
import asyncio
import hashlib
import json
import os
import re
import secrets
import time
from pathlib import Path
from urllib.parse import urlencode, urlsplit

import httpx
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[3]
TOKEN_FILE = ROOT / 'data/runtime/workbuddy-oauth.json'
APP_FILE = ROOT / 'data/runtime/workbuddy-app.json'
BASE = 'https://www.workbuddy.cn/openapi/v2'
CALLBACK = '/api/consumer/workbuddy/callback'
SCOPES = {'user.localassistant.readable', 'user.localassistant.invokable'}
_states = {}
_refresh_lock = asyncio.Lock()
ERRORS = {
    'not_configured': '请先配置 WorkBuddy 开放平台应用，再点击授权连接。',
    'auth_required': 'WorkBuddy 应用需要授权或重新授权。',
    'permission_required': 'WorkBuddy 正在等待操作确认，请在 WorkBuddy 中处理本次请求。',
    'scope_missing': 'WorkBuddy 应用缺少本地助理读取或调用权限。',
    'offline': 'WorkBuddy 本地助理未在线，请打开 WorkBuddy 并连接本地助理。',
    'rate_limited': 'WorkBuddy 接口限制访问频率，本次查询已停止。',
    'unavailable': 'WorkBuddy 接口未完成响应，本次没有取得企业数据。',
    'delivery_unknown': '查询发送结果不明；为避免重复调用，未自动重发。请在 WorkBuddy 核对。',
    'invalid_response': 'WorkBuddy 返回内容不符合接口约定，未作为企业证据。',
    'invalid_state': '授权会话已失效或不匹配，请从本机网页重新发起授权。',
    'config_invalid': '请填写完整应用凭据；回调地址须为 HTTPS 或本机 HTTP，且使用项目回调路径。',
}


class WorkBuddyError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(ERRORS.get(code, ERRORS['unavailable']))


def setting(name, default=''):
    # Read only this project's configuration, never WorkBuddy's internal login store.
    value = None
    # A saved UI configuration is one complete set; do not mix it with stale env values.
    if name in {'WORKBUDDY_CLIENT_ID', 'WORKBUDDY_CLIENT_SECRET', 'WORKBUDDY_REDIRECT_URI'}:
        try:
            saved = json.loads(APP_FILE.read_text(encoding='utf-8'))
            value = saved.get(name) if isinstance(saved, dict) else None
        except (OSError, ValueError):
            pass
    return str(value or os.getenv(name) or dotenv_values(ROOT / '.env').get(name) or default).strip()


def _write_private(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    fd = os.open(temporary, os.O_CREAT | os.O_TRUNC | os.O_WRONLY, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as stream:
        json.dump(data, stream)
    os.replace(temporary, path)


def configure(client_id, client_secret, redirect):
    client_id, client_secret, redirect = client_id.strip(), client_secret.strip(), redirect.strip()
    _validate_redirect(redirect)
    if not client_id or not client_secret or any(re.search(r'[\x00-\x1f\x7f]', v) for v in (client_id, client_secret)):
        raise WorkBuddyError('config_invalid')
    _write_private(APP_FILE, {'WORKBUDDY_CLIENT_ID': client_id, 'WORKBUDDY_CLIENT_SECRET': client_secret,
                             'WORKBUDDY_REDIRECT_URI': redirect})
    _states.clear()


def app_configured():
    return bool(setting('WORKBUDDY_CLIENT_ID') and setting('WORKBUDDY_CLIENT_SECRET'))


def redirect_uri():
    uri = setting('WORKBUDDY_REDIRECT_URI', 'http://127.0.0.1:8086' + CALLBACK)
    _validate_redirect(uri)
    return uri


def _validate_redirect(uri):
    try:
        p = urlsplit(uri)
        p.port  # Reject malformed ports before opening an authorization session.
    except ValueError:
        raise WorkBuddyError('config_invalid') from None
    if (not p.hostname or p.username or p.password or p.query or p.fragment or p.path != CALLBACK
            or not (p.scheme == 'https' or (p.scheme == 'http' and p.hostname in {'127.0.0.1', 'localhost', '::1'}))):
        raise WorkBuddyError('config_invalid')


def _read_token():
    try:
        data = json.loads(TOKEN_FILE.read_text(encoding='utf-8'))
        if not isinstance(data, dict) or data.get('client_id') != setting('WORKBUDDY_CLIENT_ID'):
            return {}
        return data
    except (OSError, ValueError):
        return {}


def _save_token(data, previous=None):
    if not isinstance(data.get('access_token'), str) or not data['access_token']:
        raise WorkBuddyError('invalid_response')
    try:
        lifetime = float(data['expires_in'])
        if not 0 < lifetime <= 366*86400:
            raise ValueError()
    except (KeyError, TypeError, ValueError):
        raise WorkBuddyError('invalid_response') from None
    granted = data.get('scope', (previous or {}).get('scope', ''))
    if not isinstance(granted, str) or not SCOPES <= set(granted.split()):
        raise WorkBuddyError('scope_missing')
    saved = {'access_token': data['access_token'], 'refresh_token': data.get('refresh_token') or (previous or {}).get('refresh_token', ''),
             'expires_at': time.time() + lifetime, 'client_id': setting('WORKBUDDY_CLIENT_ID'), 'scope': granted}
    _write_private(TOKEN_FILE, saved)
    return saved


def status():
    direct = bool(setting('WORKBUDDY_ACCESS_TOKEN'))
    data = _read_token()
    try:
        authorized = direct or bool(data.get('access_token') and (float(data.get('expires_at', 0)) > time.time()+30 or data.get('refresh_token')))
    except (TypeError, ValueError):
        authorized = False
    state = 'authorized' if authorized else 'auth_required' if app_configured() else 'not_configured'
    return {'provider': 'workbuddy', 'transport': 'openapi', 'configured': authorized,
            'app_configured': app_configured(), 'status': state, 'configurable': False,
            'message': 'WorkBuddy 应用已授权；查询企业时自动调用，实际数据以本次返回为准。' if authorized else ERRORS[state]}


def begin_auth():
    if not app_configured():
        raise WorkBuddyError('not_configured')
    now = time.monotonic()
    for key, value in list(_states.items()):
        if value['expires'] < now:
            del _states[key]
    if len(_states) >= 20:
        raise WorkBuddyError('rate_limited')
    state, browser = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    uri = redirect_uri()
    _states[state] = {'browser': hashlib.sha256(browser.encode()).hexdigest(), 'expires': now+600, 'redirect': uri,
                      'client': setting('WORKBUDDY_CLIENT_ID')}
    url = BASE + '/authorize?' + urlencode({'response_type': 'code', 'client_id': setting('WORKBUDDY_CLIENT_ID'),
        'redirect_uri': uri, 'scope': ' '.join(sorted(SCOPES)), 'state': state})
    return url, browser


async def _json(client, method, path, **kwargs):
    # Fixed official origin, no redirects (especially when carrying credentials).
    try:
        async with client.stream(method, BASE + path, **kwargs) as response:
            if response.status_code in (401, 403):
                raise WorkBuddyError('auth_required' if response.status_code == 401 else 'scope_missing')
            if response.status_code == 429:
                raise WorkBuddyError('rate_limited')
            if not 200 <= response.status_code < 300:
                raise WorkBuddyError('unavailable')
            raw = bytearray()
            async for chunk in response.aiter_bytes():
                raw.extend(chunk)
                if len(raw) > 2_000_000:
                    raise WorkBuddyError('invalid_response')
        data = json.loads(raw)
        if not isinstance(data, dict) or data.get('code', 0) not in (0, '0', 'success'):
            raise WorkBuddyError('invalid_response')
        data = data.get('data', data)
        if not isinstance(data, dict):
            raise WorkBuddyError('invalid_response')
        return data
    except httpx.HTTPError:
        raise WorkBuddyError('delivery_unknown' if method == 'POST' and path.endswith('/message') else 'unavailable') from None
    except (ValueError, TypeError):
        raise WorkBuddyError('invalid_response') from None


def client():
    return httpx.AsyncClient(timeout=20, follow_redirects=False)


async def finish_auth(state, browser, code):
    item = _states.get(state)
    if (not item or item['expires'] < time.monotonic() or not browser or not code or len(code) > 4096
            or item['client'] != setting('WORKBUDDY_CLIENT_ID')
            or not secrets.compare_digest(item['browser'], hashlib.sha256(browser.encode()).hexdigest())):
        raise WorkBuddyError('invalid_state')
    del _states[state]  # One-time state, even when exchange fails.
    async with client() as http:
        data = await _json(http, 'POST', '/token', data={'grant_type': 'authorization_code', 'code': code,
            'redirect_uri': item['redirect'], 'client_id': setting('WORKBUDDY_CLIENT_ID'), 'client_secret': setting('WORKBUDDY_CLIENT_SECRET')})
    _save_token(data)


async def access_token():
    supplied = setting('WORKBUDDY_ACCESS_TOKEN')
    if supplied:
        return supplied
    async with _refresh_lock:
        data = _read_token()
        try:
            valid = float(data.get('expires_at', 0)) > time.time()+30
        except (TypeError, ValueError):
            valid = False
        if isinstance(data.get('access_token'), str) and data['access_token'] and valid:
            return data['access_token']
        if not data.get('refresh_token') or not app_configured():
            raise WorkBuddyError('auth_required' if app_configured() else 'not_configured')
        async with client() as http:
            refreshed = await _json(http, 'POST', '/token', data={'grant_type': 'refresh_token', 'refresh_token': data['refresh_token'],
                'client_id': setting('WORKBUDDY_CLIENT_ID'), 'client_secret': setting('WORKBUDDY_CLIENT_SECRET')})
        return _save_token(refreshed, data)['access_token']


async def authorized_request(http, method, path, **kwargs):
    token = await access_token()
    return await _json(http, method, path, headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/json'}, **kwargs)


async def online(http):
    data = await authorized_request(http, 'GET', '/localassistant')
    if data.get('online') is not True:
        raise WorkBuddyError('offline')


async def send(http, content):
    data = await authorized_request(http, 'POST', '/localassistant/message', json={'content': content, 'msg_type': 'text'})
    if not isinstance(data.get('message_id'), str) or not data['message_id']:
        raise WorkBuddyError('delivery_unknown')
    return data['message_id']


async def replies(http, message_id):
    data = await authorized_request(http, 'GET', '/localassistant/message', params={'message_id': message_id})
    if not isinstance(data.get('messages'), list):
        raise WorkBuddyError('invalid_response')
    return data['messages']
