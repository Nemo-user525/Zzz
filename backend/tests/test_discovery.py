import hashlib

import httpx
from fastapi.testclient import TestClient

from app.main import app
from app.services import qcc, qcc_discovery_mcp as qcc_mcp


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


def test_street_filter_checks_later_amap_page(monkeypatch):
    monkeypatch.setenv("AMAP_WEB_SERVICE_KEY", "test-amap-key")
    pages = []

    def fake_get(url, **kwargs):
        page = kwargs["params"]["page"]
        pages.append(page)
        pois = (
            [{"id": f"other-{index}", "name": "测试健身房", "address": "别的街道"} for index in range(20)]
            if page == 1
            else [{"id": "target", "name": "测试健身房", "address": "目标街道 10 号"}]
        )
        return httpx.Response(200, json={"status": "1", "pois": pois}, request=httpx.Request("GET", url))

    monkeypatch.setattr("app.services.amap.httpx.get", fake_get)
    result = client.get("/api/places", params={"keyword": "测试健身房", "street": "目标街道"}).json()
    assert [place["id"] for place in result["places"]] == ["target"]
    assert pages == [1, 2]


def test_amap_static_map_preview_keeps_key_server_side(monkeypatch):
    monkeypatch.setenv("AMAP_WEB_SERVICE_KEY", "test-amap-key")
    calls = []

    def fake_get(url, **kwargs):
        calls.append((url, kwargs["params"]))
        return httpx.Response(
            200,
            content=b"\x89PNG\r\n\x1a\npreview",
            headers={"content-type": "image/png"},
            request=httpx.Request("GET", url),
        )

    monkeypatch.setattr("app.services.amap.httpx.get", fake_get)
    response = client.get("/api/place-map", params={"location": "120.147572,30.284751"})
    assert response.status_code == 200 and response.headers["content-type"] == "image/png"
    assert response.content.startswith(b"\x89PNG")
    assert calls[0][0].endswith("/staticmap")
    assert calls[0][1]["key"] == "test-amap-key"
    assert client.get("/api/place-map", params={"location": "bad-location"}).status_code == 422


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


def test_mcp_store_name_broadens_to_candidates_without_verifying_identity(monkeypatch):
    monkeypatch.setattr(qcc_mcp, "configured", lambda: True)
    calls = []

    async def fake_call(server, query, names):
        calls.append((server, query, names))
        data = {"匹配结果": "未匹配"} if "(" in query else {
            "匹配结果": "唯一精确匹配",
            "企业信息": {"企业名称": "测试品牌有限公司", "统一社会信用代码": "913300000000000000", "状态": "存续"},
        }
        return {"get_company_by_query": {"status": "returned", "data": data}}

    monkeypatch.setattr(qcc_mcp, "_call_many", fake_call)
    response = client.get("/api/legal-entities", params={"keyword": "测试品牌(某分店)"})
    assert response.status_code == 200
    body = response.json()
    assert body["companies"][0]["name"] == "测试品牌有限公司"
    assert body["companies"][0]["credit_code"] == "913300000000000000"
    assert "已将搜索词扩展" in body["search_note"]
    assert "合同抬头" in body["identity_note"]
    assert [query for _, query, _ in calls] == ["测试品牌(某分店)", "测试品牌"]


def test_mcp_report_retains_all_returned_details_and_marks_failures(monkeypatch):
    monkeypatch.setattr(qcc_mcp, "configured", lambda: True)
    calls = []
    name, credit = "测试品牌有限公司", "913300000000000000"
    long_records = [{"序号": index, "原始字段": "保留"} for index in range(120)]

    async def fake_call(server, query, names):
        calls.append((server, query, names))
        if names == ["get_company_risk_scan"]:
            return {"get_company_risk_scan": {"status": "returned", "data": {
                "企业名称": name, "风险因子扫描": [
                    {"风险因子": "裁判文书", "条目数": 120, "明细工具": "get_judicial_documents"},
                    {"风险因子": "行政处罚", "条目数": 0, "明细工具": "get_administrative_penalty"},
                ],
            }}}
        if names == ["get_judicial_documents"]:
            return {"get_judicial_documents": {"status": "returned", "data": {"企业名称": name, "裁判文书": long_records}}}
        return {tool: ({"status": "returned", "data": {"企业名称": name, "统一社会信用代码": credit, "经营范围": "健身"}}
                       if tool == "get_company_registration_info" else
                       {"status": "failed", "message": "暂时不可用"}) for tool in names}

    monkeypatch.setattr(qcc_mcp, "_call_many", fake_call)
    response = client.post("/api/company-report", json={"company_keyword": credit,
        "place": {"id": "poi-1", "name": "测试品牌(某分店)", "address": "某路"}})
    assert response.status_code == 200
    body = response.json()
    assert body["company_name"] == name and body["identity_status"] == "user_selected_unverified"
    assert body["data"]["经营范围"] == "健身"
    assert body["risk_scan"]["风险因子扫描"][0]["条目数"] == 120
    assert body["assessment"]["label"] == "中等风险"
    judicial = next(section for section in body["sections"] if section["tool"] == "get_judicial_documents")
    assert len(judicial["data"]["裁判文书"]) == 120
    assert "企业概况" in body["failed_sections"]
    assert all("get_administrative_penalty" not in names for _, _, names in calls)
