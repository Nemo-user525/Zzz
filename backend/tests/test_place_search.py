import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.api import place_search

app = FastAPI()
app.include_router(place_search.router)
client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_keys(monkeypatch):
    monkeypatch.delenv('AMAP_WEB_SERVICE_KEY', raising=False)
    monkeypatch.delenv('AMAP_KEY', raising=False)


def vendor(monkeypatch, payload=None, error=None):
    monkeypatch.setenv('AMAP_WEB_SERVICE_KEY', 'test-secret-key')
    seen = []
    async def get(self, url, **kwargs):
        seen.append((url, kwargs))
        if error: raise error
        return httpx.Response(200, json=payload, request=httpx.Request('GET', url))
    monkeypatch.setattr(httpx.AsyncClient, 'get', get)
    return seen


def test_missing_key_does_not_call_vendor(monkeypatch):
    async def forbidden(*args, **kwargs):
        pytest.fail('No credential means no outbound request')
    monkeypatch.setattr(httpx.AsyncClient, 'get', forbidden)
    assert client.get('/api/place-search/capabilities').json()['configured'] is False
    result = client.get('/api/place-search/places', params={'keyword': '测试门店'})
    assert result.status_code == 503
    assert result.json()['detail']['code'] == 'amap_not_configured'


@pytest.mark.parametrize('keyword', ['a', '  ', '某店\n其他', 'a' * 81, '甲|乙'])
def test_invalid_keywords_never_query_vendor(monkeypatch, keyword):
    seen = vendor(monkeypatch)
    assert client.get('/api/place-search/places', params={'keyword': keyword}).status_code == 422
    assert seen == []


def test_official_v5_parameters_and_safe_normalization(monkeypatch):
    seen = vendor(monkeypatch, {'status': '1', 'pois': [
        {'id': 'P01', 'name': '示例门店', 'pname': '浙江省', 'cityname': '杭州市', 'adname': '上城区', 'address': '示例路1号', 'location': '120.2,30.3'},
        {'id': 'P02', 'name': '无坐标门店', 'address': [], 'location': 'javascript:alert(1)'},
        {'id': 'bad', 'name': []}
    ]})
    response = client.get('/api/place-search/places', params={'keyword': ' 示例 ', 'city': '杭州市'})
    assert response.status_code == 200
    url, kwargs = seen[0]
    assert url == 'https://restapi.amap.com/v5/place/text'
    assert kwargs['params']['region'] == '杭州市'
    assert kwargs['params']['city_limit'] == 'true'
    assert kwargs['params']['keywords'] == '示例'
    assert kwargs['params']['page_size'] == '12'
    rows = response.json()['places']
    assert len(rows) == 2
    assert rows[0]['marker_url'].startswith('https://uri.amap.com/marker?')
    assert rows[0]['address'] == '浙江省 杭州市 上城区 示例路1号'
    assert rows[1]['marker_url'] == ''
    assert 'test-secret-key' not in response.text
    assert '经营主体仍需核对' in rows[0]['relationship_status']


@pytest.mark.parametrize('error,status', [(httpx.ReadTimeout('test-secret-key'), 504), (httpx.ConnectError('test-secret-key'), 502)])
def test_errors_never_leak_key_or_become_results(monkeypatch, error, status):
    vendor(monkeypatch, error=error)
    response = client.get('/api/place-search/places', params={'keyword': '示例'})
    assert response.status_code == status
    assert 'test-secret-key' not in response.text
    assert 'places' not in response.json()


@pytest.mark.parametrize('payload', [{'status': '0', 'info': 'test-secret-key'}, [], {'status': '1', 'pois': {}}])
def test_vendor_rejection_is_explicit(monkeypatch, payload):
    vendor(monkeypatch, payload)
    response = client.get('/api/place-search/places', params={'keyword': '示例'})
    assert response.status_code == 502
    assert 'test-secret-key' not in response.text


def test_empty_is_a_successful_search_not_a_positive_finding(monkeypatch):
    vendor(monkeypatch, {'status': '1', 'pois': []})
    response = client.get('/api/place-search/places', params={'keyword': '示例'})
    assert response.status_code == 200
    assert response.json()['places'] == []
    assert '不能据此确认企业归属' in response.json()['limitation']
