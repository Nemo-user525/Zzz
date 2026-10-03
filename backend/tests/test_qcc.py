import hashlib
import httpx
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services import qcc

client = TestClient(app)


@pytest.fixture(autouse=True)
def credentials(monkeypatch):
    monkeypatch.delenv('QCC_APP_KEY', raising=False)
    monkeypatch.delenv('QCC_SECRET_KEY', raising=False)


def configure(monkeypatch, payload=None, error=None):
    monkeypatch.setenv('QCC_APP_KEY', 'unit-test-app-key')
    monkeypatch.setenv('QCC_SECRET_KEY', 'unit-test-secret')
    seen = []
    async def get(self, url, **kwargs):
        seen.append((url, kwargs))
        if error:
            raise error
        return httpx.Response(200, json=payload, request=httpx.Request('GET', url))
    monkeypatch.setattr(httpx.AsyncClient, 'get', get)
    return seen


def test_missing_credentials_never_queries_vendor(monkeypatch):
    async def forbidden(*args, **kwargs):
        pytest.fail('must not call vendor without credentials')
    monkeypatch.setattr(httpx.AsyncClient, 'get', forbidden)
    assert client.get('/api/integrations/qcc/status').json()['configured'] is False
    response = client.post('/api/integrations/qcc/lookup', json={'query':'示例企业'})
    assert response.status_code == 503
    assert response.json()['code'] == 'qcc_not_configured'


def test_signature_normalization_and_no_secret_disclosure(monkeypatch):
    seen = configure(monkeypatch, {'Status':'200','Result':{'Name':'测试企业','CreditCode':'TEST123','Status':'存续','Penalty':[], 'Pledge':[{'Pledgor':'测试股东','PledgedAmount':'0'}], 'CompanyTaxCreditItems':[{'Year':'2025','Level':'B'}]}})
    monkeypatch.setattr(qcc.time, 'time', lambda: 1700000000)
    status = client.get('/api/integrations/qcc/status')
    assert status.json()['configured'] is True
    assert not seen  # status endpoint is free of vendor calls
    response = client.post('/api/integrations/qcc/lookup',json={'query':' 测试企业 '})
    assert response.status_code == 200
    assert response.headers['cache-control'] == 'no-store'
    url, kwargs = seen[0]
    assert url == qcc.URL
    assert kwargs['params']['searchKey'] == '测试企业'
    assert kwargs['headers']['Token'] == hashlib.md5(b'unit-test-app-key1700000000unit-test-secret').hexdigest().upper()
    data = response.json()
    assert data['company']['registration_status'] == '存续'
    groups = {g['id']:g for g in data['groups']}
    assert groups['Penalty']['returned_count'] == 0
    assert groups['MPledge']['available'] is False
    assert groups['MPledge']['returned_count'] is None
    assert groups['CompanyTaxCreditItems']['records'][0][-1]['value'] == 'B'
    assert 'unit-test' not in response.text + status.text


@pytest.mark.parametrize('payload', [[], {'Status':'500','Message':'unit-test-secret'}, {'Status':'200','Result':{'Status':'存续'}}, {'Status':'200','Result':'unexpected'}])
def test_invalid_and_rejected_responses_are_not_results(monkeypatch, payload):
    configure(monkeypatch, payload)
    response = client.post('/api/integrations/qcc/lookup', json={'query':'测试企业'})
    assert response.status_code == 502
    assert 'company' not in response.json()
    assert 'unit-test' not in response.text


def test_empty_result_has_explicit_state(monkeypatch):
    configure(monkeypatch, {'Status':'200','Result':None})
    response = client.post('/api/integrations/qcc/lookup', json={'query':'不存在企业'})
    assert response.status_code == 404
    assert response.json()['code'] == 'qcc_not_found'


@pytest.mark.parametrize('error,status',[(httpx.ReadTimeout('unit-test-secret'),504),(httpx.ConnectError('unit-test-app-key'),502)])
def test_vendor_connection_error_is_sanitized(monkeypatch,error,status):
    configure(monkeypatch, error=error)
    response = client.post('/api/integrations/qcc/lookup', json={'query':'测试企业'})
    assert response.status_code == status
    assert 'unit-test' not in response.text


@pytest.mark.parametrize('query',[' ', 'a', 'a'*101, '企业\x00'])
def test_invalid_query_rejected_before_vendor(monkeypatch,query):
    seen = configure(monkeypatch)
    assert client.post('/api/integrations/qcc/lookup',json={'query':query}).status_code == 422
    assert not seen
