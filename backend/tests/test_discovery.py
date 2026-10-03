import hashlib

import httpx
from fastapi.testclient import TestClient

from app.main import app
from app.services import qcc


client = TestClient(app)


def test_missing_provider_configuration_is_explicit(monkeypatch):
    monkeypatch.delenv("AMAP_WEB_SERVICE_KEY", raising=False)
    monkeypatch.delenv("QCC_APP_KEY", raising=False)
    monkeypatch.delenv("QCC_SECRET_KEY", raising=False)
    status = client.get("/api/integrations").json()
    assert not status["amap"]["configured"] and not status["qcc"]["configured"]
    assert client.get("/api/places", params={"keyword": "健身房"}).status_code == 503
    assert client.get("/api/legal-entities", params={"keyword": "健身"}).status_code == 503


def test_amap_region_and_place_selection(monkeypatch):
    monkeypatch.setenv("AMAP_WEB_SERVICE_KEY", "test-amap-key")
    calls = []

    def fake_get(url, **kwargs):
        calls.append((url, kwargs["params"]))
        if url.endswith("/config/district"):
            data = {"status": "1", "districts": [{"districts": [{"name": "浙江省", "adcode": "330000", "level": "province"}]}]}
        else:
            data = {"status": "1", "pois": [
                {"id": "poi-1", "name": "测试健身房", "address": "文一西路某街道 10 号", "pname": "浙江省", "cityname": "杭州市", "adname": "余杭区", "adcode": "330110", "location": "120.1,30.2"},
                {"id": "poi-2", "name": "测试健身房分店", "address": "另一条路", "pname": "浙江省", "cityname": "杭州市", "adname": "余杭区", "adcode": "330110", "location": "120.2,30.2"},
            ]}
        return httpx.Response(200, json=data, request=httpx.Request("GET", url))

    monkeypatch.setattr("app.services.amap.httpx.get", fake_get)
    assert client.get("/api/regions", params={"parent": "100000"}).json()["regions"][0]["name"] == "浙江省"
    result = client.get("/api/places", params={"keyword": "测试健身房", "region_code": "330110", "street": "某街道"}).json()
    assert [p["id"] for p in result["places"]] == ["poi-1"]
    assert calls[-1][1]["city"] == "330110" and calls[-1][1]["citylimit"] == "true"
    assert calls[-1][1]["key"] == "test-amap-key"


def test_qcc_signed_search_and_full_scan_result(monkeypatch):
    monkeypatch.setenv("QCC_APP_KEY", "test-app-key")
    monkeypatch.setenv("QCC_SECRET_KEY", "test-secret")
    monkeypatch.setattr(qcc.time, "time", lambda: 1700000000)
    calls = []

    def fake_get(url, **kwargs):
        calls.append((url, kwargs))
        if url.endswith("/GetList"):
            result = [{"KeyNo": "q-1", "Name": "测试健身有限公司", "CreditCode": "913300000000000000", "Address": "杭州市", "Status": "存续"}]
        else:
            result = {"Name": "测试健身有限公司", "CreditCode": "913300000000000000", "Penalty": [{"DocNo": "A"}], "Exceptions": [], "CustomField": {"kept": True}}
        return httpx.Response(200, json={"Status": "200", "OrderNumber": "order-1", "Result": result}, request=httpx.Request("GET", url))

    monkeypatch.setattr(qcc.httpx, "get", fake_get)
    entities = client.get("/api/legal-entities", params={"keyword": "测试健身"}).json()
    assert entities["companies"][0]["credit_code"] == "913300000000000000"
    report = client.post("/api/company-report", json={"company_keyword": "913300000000000000", "place": {"id": "poi-1", "name": "测试健身房", "address": "文一西路"}}).json()
    assert report["data"]["CustomField"] == {"kept": True}
    assert report["data"]["Penalty"] == [{"DocNo": "A"}]
    assert report["identity_status"] == "user_selected_unverified"
    expected = hashlib.md5(b"test-app-key1700000000test-secret").hexdigest().upper()
    assert all(call[1]["headers"]["Token"] == expected for call in calls)
    assert calls[-1][1]["params"]["searchKey"] == "913300000000000000"
