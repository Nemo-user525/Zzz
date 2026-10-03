import httpx
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services import public_financials as source

client = TestClient(app)
CODE = '000333.SZ'


@pytest.fixture(autouse=True)
def clear_cache(monkeypatch):
    monkeypatch.setattr(source, '_cache', {})


def payload(**fields):
    return {'success': True, 'result': {'data': [{
        'SECUCODE': CODE, 'SECURITY_NAME_ABBR': '测试企业', 'REPORT_DATE': '2026-06-30 00:00:00',
        'REPORT_DATE_NAME': '2026中报', 'NOTICE_DATE': '2026-08-29', 'CURRENCY': 'CNY', **fields,
    }]}}


def test_normalize_keeps_zero_missing_currency_and_period():
    data = source.normalize(payload(MONETARYFUNDS=0, TOTAL_ASSETS=1000, TOTAL_LIABILITIES=400, SHORT_LOAN=True), CODE, source.REPORTS[0])
    row = data['records'][0]
    metrics = {m['id']: m['value'] for m in row['metrics']}
    assert row['report_date'] == '2026-06-30'
    assert row['published_at'] == '2026-08-29'
    assert row['currency'] == 'CNY'
    assert metrics['MONETARYFUNDS'] == 0
    assert metrics['ACCOUNTS_RECE'] is None
    assert metrics['SHORT_LOAN'] is None
    assert metrics['debt_ratio'] == 40


@pytest.mark.parametrize('assets,liabilities', [(0, 30), (None, 30), (100, None), (100, -1), (float('nan'), 10)])
def test_no_ratio_from_missing_or_invalid_values(assets, liabilities):
    row = source.normalize(payload(TOTAL_ASSETS=assets, TOTAL_LIABILITIES=liabilities), CODE, source.REPORTS[0])['records'][0]
    assert row['metrics'][-1]['value'] is None


def test_rejects_mismatched_identity_without_partial_rows():
    data = payload()
    data['result']['data'].append({**data['result']['data'][0], 'SECUCODE':'600519.SH'})
    result = source.normalize(data, CODE, source.REPORTS[0])
    assert result['status'] == 'failed'
    assert result['records'] == []


@pytest.mark.parametrize('code', ['000333', '000333.SH', '600519.SZ', 'x" OR true', 'https://example.com'])
def test_invalid_code_never_contacts_source(monkeypatch, code):
    async def forbidden(*args, **kwargs):
        pytest.fail('invalid code must not contact source')
    monkeypatch.setattr(httpx.AsyncClient, 'get', forbidden)
    assert client.get('/api/integrations/public-financials', params={'code':code}).status_code == 422


def test_partial_source_failure_keeps_other_reports_and_limits_requests(monkeypatch):
    seen = []
    async def get(self, url, **kwargs):
        seen.append((url, kwargs))
        if kwargs['params']['reportName'].endswith('GINCOME'):
            raise httpx.ReadTimeout('raw vendor failure')
        if kwargs['params']['reportName'].endswith('GCASHFLOW'):
            body = payload(REPORT_DATE='2026-03-31 00:00:00', NETCASH_OPERATE=-100)
        else:
            body = payload(TOTAL_ASSETS=1000, TOTAL_LIABILITIES=400)
        return httpx.Response(200, json=body, request=httpx.Request('GET', url))
    monkeypatch.setattr(httpx.AsyncClient, 'get', get)
    response = client.get('/api/integrations/public-financials', params={'code':CODE})
    assert response.status_code == 200
    result = response.json()
    assert result['status'] == 'partial'
    assert result['groups'][0]['records'][0]['report_date'] == '2026-06-30'
    assert result['groups'][1]['status'] == 'failed'
    assert result['groups'][2]['records'][0]['report_date'] == '2026-03-31'
    assert 'raw vendor failure' not in response.text
    assert len(seen) == 3
    assert all(url == source.URL and kwargs['params']['pageSize'] == 4 for url,kwargs in seen)
    cached = client.get('/api/integrations/public-financials', params={'code':CODE}).json()
    # Partial results must allow retrying the failed table, not freeze that failure.
    assert cached['cached'] is False
    assert len(seen) == 6


def test_complete_empty_and_malformed_responses_are_distinct():
    empty = source.normalize({'success':True,'result':{'data':[]}}, CODE, source.REPORTS[0])
    broken = source.normalize({'success':True,'result':None}, CODE, source.REPORTS[0])
    assert empty['status'] == 'empty'
    assert broken['status'] == 'failed'


def test_failed_queries_can_retry_without_cached_failure(monkeypatch):
    seen=[]
    async def get(self,url,**kwargs):
        seen.append(url)
        return httpx.Response(200,json={'success':False,'message':'internal message'},request=httpx.Request('GET',url))
    monkeypatch.setattr(httpx.AsyncClient,'get',get)
    for _ in range(2):
        result=client.get('/api/integrations/public-financials',params={'code':CODE})
        assert result.json()['status'] == 'failed'
        assert 'internal message' not in result.text
    assert len(seen) == 6


def test_complete_success_cache_preserves_original_retrieval_time(monkeypatch):
    seen=[]
    async def get(self,url,**kwargs):
        seen.append(url)
        return httpx.Response(200,json=payload(),request=httpx.Request('GET',url))
    monkeypatch.setattr(httpx.AsyncClient,'get',get)
    first=client.get('/api/integrations/public-financials',params={'code':CODE}).json()
    second=client.get('/api/integrations/public-financials',params={'code':CODE}).json()
    assert second['cached'] is True
    assert second['retrieved_at'] == first['retrieved_at']
    assert len(seen) == 3
