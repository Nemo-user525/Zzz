from datetime import date

from app.services.qcc_discovery_risk import assess


NAME = "测试健身有限公司"


def report(status="存续", factors=None, sections=None, failures=None):
    return {
        "company_name": NAME,
        "data": {"企业名称": NAME, "登记状态": status},
        "risk_scan": {"企业名称": NAME, "风险因子扫描": factors or []},
        "sections": sections or [],
        "failed_sections": failures or [],
    }


def test_recent_service_defendant_case_gives_medium_not_high():
    rows = [
        {"案号": "案一", "案由": "健身服务合同纠纷", "裁判日期": "2026-03-05",
         "当事人": {"被告": [NAME]}},
        {"案号": "案二", "案由": "健身服务合同纠纷", "裁判日期": "2026-04-02",
         "当事人": {"原告": [NAME], "被告": ["另一家公司"]}},
    ]
    result = assess(report(sections=[{"title": "裁判文书", "tool": "get_judicial_documents",
        "status": "returned", "data": {"企业名称": NAME, "裁判文书": rows}}]), date(2026, 10, 3))
    assert result["level"] == "medium"
    assert "1 份" in result["reasons"][1]["text"]
    assert "案一" in result["reasons"][1]["text"]
    assert "案号案一" in result["reasons"][1]["text"]


def test_severe_registration_or_confirmed_risk_gives_high():
    assert assess(report(status="吊销"))["level"] == "high"
    assert assess(report(status="吊销，未注销"))["level"] == "high"
    factors = [{"风险因子": "失信信息", "条目数": 1, "明细工具": "get_dishonest_info"}]
    sections = [{"title": "失信信息", "tool": "get_dishonest_info", "status": "returned",
                 "data": {"企业名称": NAME, "失信信息": [{"案号": "案三"}]}}]
    result = assess(report(factors=factors, sections=sections))
    assert result["level"] == "high"
    assert "失信信息 1 条" in result["reasons"][1]["text"]


def test_low_requires_complete_scan_and_severe_count_without_details_is_medium():
    complete_scan = [{"风险因子": f"项目{i}", "条目数": 0} for i in range(35)]
    assert assess(report(factors=complete_scan))["level"] == "low"
    severe = [{"风险因子": "失信信息", "条目数": 1, "明细工具": "get_dishonest_info"}]
    assert assess(report(factors=severe))["level"] == "medium"
    assert assess({**report(), "risk_scan": None})["level"] == "medium"
