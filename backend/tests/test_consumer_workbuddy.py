"""Mock official HTTP contracts in isolated storage; never write demo results."""
import asyncio
import json
import time
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.consumer import Step
from app.services import consumer_registry, consumer_search, consumer_qcc_mcp, consumer_workbuddy as wb, workbuddy_client as wc

NAME = '接口测试有限公司'


@pytest.fixture(autouse=True)
def isolated(monkeypatch, tmp_path):
    monkeypatch.setattr(wc, 'ROOT', tmp_path)
    monkeypatch.setattr(wc, 'APP_FILE', tmp_path / 'app.json')
    monkeypatch.setattr(wc, 'TOKEN_FILE', tmp_path / 'token.json')
    monkeypatch.setattr(wc, '_states', {})
    monkeypatch.setattr(wc, '_refresh_lock', asyncio.Lock())
    monkeypatch.setattr(wb, '_QUERY_LOCK', asyncio.Lock())
    for key in ('WORKBUDDY_ACCESS_TOKEN', 'WORKBUDDY_CLIENT_ID', 'WORKBUDDY_CLIENT_SECRET', 'WORKBUDDY_REDIRECT_URI'):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv('QCC_PROVIDER', 'workbuddy')


def record(name=NAME, tool=wb.TOOLS[0]):
    return {'tool': tool, 'arguments': {'searchKey': NAME},
            'result': {'Status': '200', 'Result': {'Name': name, 'Status': '存续', 'RegistCapi': '100万元'}},
            'retrieved_at': datetime.now(timezone.utc).isoformat()}


def configure():
    wc.configure('app-test', 'test-secret', 'http://127.0.0.1:8086' + wc.CALLBACK)


def token(**changes):
    return {'access_token': 'test-token', 'refresh_token': 'test-refresh', 'expires_in': 3600,
            'scope': ' '.join(wc.SCOPES), **changes}


def mock_http(monkeypatch, handler):
    monkeypatch.setattr(wc, 'client', lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler)))


def local_api():
    return TestClient(app, base_url='http://127.0.0.1:8086', client=('127.0.0.1', 123))


def provider(monkeypatch, outcome='ok', records=None):
    monkeypatch.setenv('WORKBUDDY_ACCESS_TOKEN', 'test-token')
    seen, job = [], {}
    def handle(request):
        assert request.url.host == 'www.workbuddy.cn'
        assert request.headers['Authorization'] == 'Bearer test-token'
        seen.append((request.method, request.url.path))
        if request.url.path.endswith('/localassistant'):
            data = {'online': True}
        elif request.method == 'POST':
            message = json.loads(request.content)
            assert message['msg_type'] == 'text'
            job.update(json.loads(message['content'].split('\n')[0].split('：', 1)[1]))
            data = {'message_id': 'sent-001'}
        else:
            assert request.url.params['message_id'] == 'sent-001'
            response = {'request_id': job['request_id'], 'company': NAME, 'outcome': outcome,
                        'records': records if records is not None else [record()]}
            data = {'messages': [{'message_id': 'reply-002', 'role': 'assistant', 'content': [json.dumps(response)]}]}
        return httpx.Response(200, json={'code': 0, 'data': data})
    mock_http(monkeypatch, handle)
    return seen


def test_official_http_roundtrip_reaches_company_evidence(monkeypatch):
    seen = provider(monkeypatch)
    rows, step, name = asyncio.run(consumer_registry.lookup(NAME, True))
    assert name == NAME and step.status == 'completed'
    assert len(seen) == 3
    assert any('100万元' in row.excerpt for row in rows)
    assert all(row.verification_status == 'provider_response' and '未独立在线复验' in row.page_status for row in rows)


def test_lookup_evidence_and_training_criteria_reach_model_input(monkeypatch):
    from app.services import consumer_agent as agent
    provider(monkeypatch, records=[record(), record(tool=wb.TOOLS[1])])
    async def search(query, purpose):
        return [], Step(action=purpose, status='completed', detail='isolated empty search')
    monkeypatch.setattr(consumer_search, 'search', search)
    monkeypatch.setattr(agent.criteria, 'reference', lambda text: {'matches': [], 'test_training_criteria': 'separate reference'})
    state = {'identity': {'name': NAME}, 'context': {'query': NAME}, 'trace': [], 'sources': [], 'model_calls': 0}
    state.update(asyncio.run(agent.collect(state)))
    data = agent.payload(state, state['sources'])
    assert len(data['sources']) == 2
    assert all('100万元' in row['excerpt'] for row in data['sources'])
    assert data['criteria']['test_training_criteria'] == 'separate reference'
    assert len(state['cashflow'].scenarios) == 3
    assert any(step.action == 'WorkBuddy 企查查' and step.status == 'completed' for step in state['trace'])
    model_inputs = []
    async def structured(instruction, data, schema, **kwargs):
        model_inputs.append(data)
        if schema is agent.Findings:
            return schema(findings=[{'indicator_id': 'identity', 'explanation': '返回了登记信息，仍需核对具体门店关系。',
                'question': '该企业是否为实际收款方？',
                'citations': [{'source_id': data['sources'][0]['id'], 'quote': '100万元'}]}])
        return schema(level='undetermined', explanation='只有登记资料，缺少现有履约证据。', reasons=[], confidence='low')
    monkeypatch.setattr(agent.consumer_model, 'effective_mode', lambda: 'ollama')
    monkeypatch.setattr(agent.consumer_model, 'model_name', lambda: 'test-only-model')
    monkeypatch.setattr(agent.consumer_model, 'structured', structured)
    result = asyncio.run(agent.synthesize(state))
    assert result['trace'][-1].status == 'completed'
    assert len(model_inputs) == 2
    final_input = model_inputs[-1]
    assert final_input['sources'][0]['quote_passages'] == ['100万元']
    assert final_input['criteria'] == data['criteria']
    assert 'reviews' in final_input and len(final_input['cashflow']['scenarios']) == 3


def test_default_provider_never_falls_back_to_cookie(monkeypatch):
    def forbidden(*args):
        pytest.fail('legacy adapter was used')
    monkeypatch.setattr(consumer_registry.qcc, 'credentials', forbidden)
    rows, step, name = asyncio.run(consumer_registry.lookup(NAME, True))
    assert not rows and name is None and step.status == 'not_configured'
    source = consumer_search.make_source(NAME, 'https://www.qcc.com/firm/' + 'a'*32 + '.html', NAME, '工商')
    from app.services import consumer_qcc_session
    monkeypatch.setattr(consumer_qcc_session, 'read', forbidden)
    assert asyncio.run(consumer_search.read_page(source)) == ''
    assert 'WorkBuddy' in source.page_status


@pytest.mark.parametrize('outcome', ['auth_required', 'quota_exceeded', 'not_found', 'unavailable'])
def test_connector_failure_never_becomes_evidence(monkeypatch, outcome):
    provider(monkeypatch, outcome=outcome)
    rows, step, name = asyncio.run(wb.lookup(NAME, True))
    assert not rows and name is None and step.status == outcome


@pytest.mark.parametrize('status,expected', [(401, 'auth_required'), (403, 'scope_missing'), (429, 'rate_limited'), (503, 'unavailable')])
def test_http_failure_is_not_retried_or_exposed(monkeypatch, status, expected):
    monkeypatch.setenv('WORKBUDDY_ACCESS_TOKEN', 'test-token')
    calls = []
    def handle(request):
        calls.append(request)
        return httpx.Response(status, text='private upstream body')
    mock_http(monkeypatch, handle)
    rows, step, _ = asyncio.run(wb.lookup(NAME, True))
    assert not rows and step.status == expected and len(calls) == 1
    assert 'private' not in step.detail


def test_ambiguous_delivery_is_never_resent(monkeypatch):
    monkeypatch.setenv('WORKBUDDY_ACCESS_TOKEN', 'test-token')
    calls = []
    def handle(request):
        calls.append(request.method)
        if request.method == 'POST':
            raise httpx.ReadTimeout('private upstream body')
        return httpx.Response(200, json={'online': True})
    mock_http(monkeypatch, handle)
    rows, step, _ = asyncio.run(wb.lookup(NAME, True))
    assert not rows and step.status == 'delivery_unknown' and calls == ['GET', 'POST']


def test_offline_does_not_send_query(monkeypatch):
    monkeypatch.setenv('WORKBUDDY_ACCESS_TOKEN', 'test-token')
    mock_http(monkeypatch, lambda request: httpx.Response(200, json={'online': False}))
    rows, step, _ = asyncio.run(wb.lookup(NAME, True))
    assert not rows and step.status == 'offline'


@pytest.mark.parametrize('problem', ['identity', 'secret', 'embedded_secret', 'summary', 'wrong_argument', 'old_time', 'error', 'other_financial_company'])
def test_invalid_records_rejected(problem):
    records = [record()]
    if problem == 'identity': records[0] = record('其他有限公司')
    if problem == 'secret': records[0]['result']['Authorization'] = 'test-only'
    if problem == 'embedded_secret':
        payload = records[0]['result'] | {'access_token': 'test-only'}
        records[0]['result'] = {'content': [{'type': 'text', 'text': json.dumps(payload)}]}
    if problem == 'summary': records[0]['result'] = {'content': [{'type': 'text', 'text': '我认为经营稳定'}]}
    if problem == 'wrong_argument': records[0]['arguments'] = {'searchKey': '其他公司'}
    if problem == 'old_time': records[0]['retrieved_at'] = '2000-01-01T00:00:00+00:00'
    if problem == 'error': records[0]['result']['Status'] = '401'
    if problem == 'other_financial_company': records.append(record('其他有限公司', wb.TOOLS[1]))
    with pytest.raises(ValueError): wb.validate_records(records, NAME, time.time())


def test_unrelated_chat_is_ignored_and_permission_is_not_approved():
    unrelated = {'request_id': 'other', 'company': NAME, 'outcome': 'ok', 'records': [record()]}
    messages = [{'role': 'assistant', 'content': [json.dumps(unrelated)]}, {'metadata': 'malformed', 'role': 'assistant', 'content': [{'text': None}]}]
    assert wb.reply_result(messages, 'current', NAME, time.time()) is None
    with pytest.raises(wc.WorkBuddyError, match='操作确认'):
        wb.reply_result([{'msg_type': 'permission_request'}], 'current', NAME, time.time())


def test_mcp_text_json_and_truncation():
    r = record()
    r['result'] = {'content': [{'type': 'text', 'text': json.dumps(r['result'], ensure_ascii=False)}]}
    validated = wb.validate_records([r], NAME, time.time())
    validated[0]['result']['items'] = [{'field': 'x'*400} for _ in range(41)]
    rows = wb.evidence('test', NAME, validated)
    assert len(rows) == 12 and all('仅纳入前' in row.page_status for row in rows)


def test_cancellation_stops_polling_and_releases_lock(monkeypatch):
    async def run():
        monkeypatch.setenv('WORKBUDDY_ACCESS_TOKEN', 'test-token')
        waiting = asyncio.Event()
        async def handle(request):
            waiting.set()
            await asyncio.Future()
        mock_http(monkeypatch, handle)
        task = asyncio.create_task(wb.lookup(NAME, True))
        await waiting.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError): await task
        assert not wb._QUERY_LOCK.locked()
    asyncio.run(run())


def test_configuration_api_is_local_and_secrets_never_return(monkeypatch):
    body = {'client_id': 'app-test', 'client_secret': 'test-secret', 'redirect_uri': 'http://127.0.0.1:8086' + wc.CALLBACK}
    local = local_api()
    for headers in ({'Origin': 'http://evil.example'}, {'Origin': 'http://127.0.0.1:9999'}, {'X-Forwarded-For': '127.0.0.1'}):
        assert local.post('/api/consumer/workbuddy/config', json=body, headers=headers).status_code == 403
    response = local.post('/api/consumer/workbuddy/config', json=body)
    assert response.status_code == 200 and response.json()['app_configured'] is True
    assert 'test-secret' not in response.text and wc.APP_FILE.is_file()
    monkeypatch.setenv('WORKBUDDY_REDIRECT_URI', 'http://localhost:9999' + wc.CALLBACK)
    assert wc.redirect_uri() == body['redirect_uri']
    assert local.post('/api/consumer/qcc-session', json={'cookie': 'test-only'}).status_code == 409
    assert 'test-secret' not in local.get('/api/consumer/qcc-session').text
    public = TestClient(app, base_url='https://demo.example', client=('203.0.113.1', 123))
    assert public.post('/api/consumer/workbuddy/config', json=body).status_code == 403
    assert public.get('/api/consumer/qcc-session').json()['configurable'] is False


@pytest.mark.parametrize('uri', ['http://evil.example/api/consumer/workbuddy/callback', 'https://example.com/wrong', 'http://[broken', 'http://127.0.0.1:bad/api/consumer/workbuddy/callback'])
def test_invalid_callback_configuration(uri):
    with pytest.raises(wc.WorkBuddyError): wc.configure('app-test', 'secret', uri)
    assert not wc.APP_FILE.exists()


def test_oauth_browser_binding_exchange_and_replay(monkeypatch):
    configure()
    calls = []
    def handle(request):
        fields = parse_qs(request.content.decode())
        assert fields['client_secret'] == ['test-secret']
        assert fields['redirect_uri'] == ['http://127.0.0.1:8086' + wc.CALLBACK]
        calls.append(request)
        return httpx.Response(200, json=token())
    mock_http(monkeypatch, handle)
    local = local_api()
    response = local.post('/api/consumer/workbuddy/authorize')
    url = response.json()['authorization_url']
    params = parse_qs(urlsplit(url).query)
    state = params['state'][0]
    assert set(params['scope'][0].split()) == wc.SCOPES
    assert 'HttpOnly' in response.headers['set-cookie'] and 'test-secret' not in url
    other = local_api()
    assert other.get(wc.CALLBACK, params={'state': state, 'code': 'code-test'}, follow_redirects=False).headers['location'].endswith('invalid_state')
    callback = local.get(wc.CALLBACK, params={'state': state, 'code': 'code-test'}, follow_redirects=False)
    assert callback.headers['location'] == '/?workbuddy=connected'
    assert callback.headers['cache-control'] == 'no-store'
    assert wc.status()['configured'] and len(calls) == 1
    assert local.get(wc.CALLBACK, params={'state': state, 'code': 'code-test'}, follow_redirects=False).headers['location'].endswith('invalid_state')
    assert len(calls) == 1


def test_expired_state_and_missing_scopes_are_rejected():
    configure()
    url, browser = wc.begin_auth()
    state = parse_qs(urlsplit(url).query)['state'][0]
    wc._states[state]['expires'] = 0
    with pytest.raises(wc.WorkBuddyError): asyncio.run(wc.finish_auth(state, browser, 'test'))
    with pytest.raises(wc.WorkBuddyError): wc._save_token(token(scope='user.localassistant.readable'))
    assert not wc.TOKEN_FILE.exists()


def test_refresh_preserves_refresh_token_and_binds_app(monkeypatch):
    configure()
    saved = wc._save_token(token())
    wc._write_private(wc.TOKEN_FILE, saved | {'expires_at': 0})
    calls = []
    def handle(request):
        assert parse_qs(request.content.decode())['refresh_token'] == ['test-refresh']
        calls.append(request)
        return httpx.Response(200, json={'access_token': 'new-test-token', 'expires_in': 3600})
    mock_http(monkeypatch, handle)
    assert asyncio.run(wc.access_token()) == 'new-test-token'
    assert wc._read_token()['refresh_token'] == 'test-refresh' and len(calls) == 1
    assert asyncio.run(wc.access_token()) == 'new-test-token' and len(calls) == 1
    wc.configure('different-app', 'secret', 'http://127.0.0.1:8086' + wc.CALLBACK)
    assert not wc.status()['configured']


def test_enterprise_agent_status_reuses_selected_mcp_configuration_without_frontend_settings(monkeypatch):
    monkeypatch.setenv('QCC_PROVIDER', 'mcp')
    monkeypatch.setattr(consumer_qcc_mcp, 'credentials', lambda: (consumer_qcc_mcp.DEFAULT_URL, 'private-mcp-key'))
    monkeypatch.setattr(consumer_qcc_mcp, 'LAST', {})
    response = local_api().get('/api/consumer/enterprise-agent/status')
    assert response.status_code == 200
    assert response.headers['cache-control'] == 'no-store'
    data = response.json()
    assert data['provider'] == 'qcc_mcp'
    assert data['active_registry_provider'] == 'qcc_mcp'
    assert data['selected'] is True and data['configured'] is True
    assert data['status'] == 'ready'
    assert data['configurable'] is False
    assert not any(key in data for key in ('client_secret', 'access_token', 'refresh_token'))
    assert 'private-mcp-key' not in response.text
    remote = TestClient(app, base_url='https://demo.example', client=('203.0.113.1', 123))
    assert remote.get('/api/consumer/enterprise-agent/status').json()['configurable'] is False


def test_explicit_enterprise_query_never_falls_back_when_workbuddy_unconfigured(monkeypatch):
    monkeypatch.setenv('QCC_PROVIDER', 'workbuddy')
    async def forbidden(*args, **kwargs):
        pytest.fail('explicit WorkBuddy request used a different provider')
    monkeypatch.setattr(consumer_registry, 'lookup', forbidden)
    from app.services import consumer_model, consumer_qcc_mcp
    monkeypatch.setattr(consumer_model, 'structured', forbidden)
    monkeypatch.setattr(consumer_qcc_mcp, 'lookup', forbidden)
    response = local_api().post('/api/consumer/enterprise-agent/query',
        json={'company_name': NAME, 'identity_confirmed': True})
    assert response.status_code == 200
    assert response.headers['cache-control'] == 'no-store'
    data = response.json()
    assert data['provider'] == 'workbuddy' and data['status'] == 'not_configured'
    assert data['sources'] == [] and data['matched_company_name'] is None


def test_explicit_enterprise_query_returns_actual_workbuddy_evidence(monkeypatch):
    monkeypatch.setenv('QCC_PROVIDER', 'workbuddy')
    calls = provider(monkeypatch)
    response = local_api().post('/api/consumer/enterprise-agent/query',
        json={'company_name': NAME, 'identity_confirmed': True})
    assert response.status_code == 200 and len(calls) == 3
    data = response.json()
    assert data['status'] == 'completed' and data['matched_company_name'] == NAME
    assert data['sources'][0]['publisher'] == '企查查 MCP（WorkBuddy 回传）'
    assert '100万元' in data['sources'][0]['excerpt']
    assert data['step']['source_ids'] == [source['id'] for source in data['sources']]


@pytest.mark.parametrize('body', [
    {'company_name': NAME},
    {'company_name': NAME, 'identity_confirmed': False},
    {'company_name': NAME, 'identity_confirmed': True, 'provider': 'mcp'},
])
def test_enterprise_query_requires_explicit_confirmed_identity(body):
    assert local_api().post('/api/consumer/enterprise-agent/query', json=body).status_code == 422


def test_enterprise_query_uses_selected_mcp_and_precise_company_only(monkeypatch):
    monkeypatch.setenv('QCC_PROVIDER', 'mcp')
    rows = [row.model_copy(update={'publisher': '企查查官方 MCP'}) for row in wb.evidence('test', NAME, [record()])]
    calls = []
    async def lookup(query, exact=False):
        calls.append((query, exact))
        return rows, Step(action='企查查 MCP', status='completed', detail='官方返回企业资料', source_ids=[r.id for r in rows]), NAME
    async def forbidden(*args, **kwargs):
        pytest.fail('MCP query silently switched provider')
    monkeypatch.setattr(consumer_qcc_mcp, 'lookup', lookup)
    monkeypatch.setattr(wb, 'lookup', forbidden)
    response = local_api().post('/api/consumer/enterprise-agent/query',
        json={'company_name': NAME, 'identity_confirmed': True})
    assert response.status_code == 200 and calls == [(NAME, True)]
    data = response.json()
    assert data['provider'] == 'qcc_mcp' and data['matched_company_name'] == NAME
    assert data['sources'][0]['publisher'] == '企查查官方 MCP'
    assert data['step']['source_ids'] == [row.id for row in rows]


def test_mcp_failure_is_reported_without_workbuddy_or_model_fallback(monkeypatch):
    monkeypatch.setenv('QCC_PROVIDER', 'mcp')
    async def failure(query, exact=False):
        return [], Step(action='企查查 MCP', status='failed', detail='接口未完成响应'), None
    async def forbidden(*args, **kwargs):
        pytest.fail('failed connector switched provider')
    monkeypatch.setattr(consumer_qcc_mcp, 'lookup', failure)
    monkeypatch.setattr(wb, 'lookup', forbidden)
    from app.services import consumer_model
    monkeypatch.setattr(consumer_model, 'structured', forbidden)
    data = local_api().post('/api/consumer/enterprise-agent/query',
        json={'company_name': NAME, 'identity_confirmed': True}).json()
    assert data['provider'] == 'qcc_mcp' and data['status'] == 'failed'
    assert data['sources'] == [] and data['matched_company_name'] is None


def test_unsupported_direct_provider_never_makes_another_query(monkeypatch):
    monkeypatch.setenv('QCC_PROVIDER', 'direct')
    async def forbidden(*args, **kwargs):
        pytest.fail('unsupported provider executed another query')
    monkeypatch.setattr(consumer_qcc_mcp, 'lookup', forbidden)
    monkeypatch.setattr(wb, 'lookup', forbidden)
    api = local_api()
    status = api.get('/api/consumer/enterprise-agent/status').json()
    assert status['provider'] == 'direct' and status['status'] == 'unsupported_provider'
    assert status['configured'] is False and status['configurable'] is False
    result = api.post('/api/consumer/enterprise-agent/query',
        json={'company_name': NAME, 'identity_confirmed': True}).json()
    assert result['provider'] == 'direct' and result['status'] == 'unsupported_provider'
    assert result['sources'] == [] and result['matched_company_name'] is None
