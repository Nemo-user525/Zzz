import json
from pathlib import Path
from fastapi.testclient import TestClient
from app.main import app
from app.db.seed import seed, verify_excerpt
from app.db.models import ROOT
from app.services.evidence import effective_status, mark_conflicts
from app.services import llm


def payload():
    return json.loads((ROOT / "data/demo_scenarios.json").read_text(encoding="utf-8"))


def test_seed_idempotent_and_sources():
    first, second = seed(), seed()
    assert {k: first[k] for k in ("companies", "sources", "facts", "risk_events")} == {k: second[k] for k in ("companies", "sources", "facts", "risk_events")}
    assert second["companies"] == 1 and second["sources"] == 2 and second["facts"] == 4 and second["risk_events"] == 1
    assert second["verified_sources"] == 2


def test_cash_and_payment_day():
    seed()
    client = TestClient(app)
    inp = payload()
    no_advance = client.post("/api/simulations", json=inp).json()
    assert no_advance["minimum_balance_yuan"] == 30000
    assert no_advance["first_breach_day"] == 75
    assert no_advance["shortfall_yuan"] == 170000
    assert no_advance["final_payment_day"] == 130
    assert no_advance["outside_view_payment"]
    inp["prepayment_rate"] = 0.3
    advance = client.post("/api/simulations", json=inp).json()
    assert advance["minimum_balance_yuan"] == 330000
    assert advance["first_breach_day"] is None
    inp["delay_days"] = 60
    assert client.post("/api/simulations", json=inp).json()["final_payment_day"] == 160


def test_evidence_rejection_and_http():
    assert not verify_excerpt(ROOT / "data/source_docs/report_summary_2026_H1.pdf", 3, "营业收入 999,999,999.99")
    seed()
    client = TestClient(app)
    assert client.get("/api/health").json()["verified_source_count"] == 2
    assert client.get("/api/companies/halo-688173/risk-events").json()[0]["affected_entity"].startswith("Zinitix")
    bad = payload()
    bad["prepayment_rate"] = 1.2
    response = client.post("/api/simulations", json=bad)
    assert response.status_code == 422 and response.json()["code"] == "invalid_input"


def test_conflict_and_configurable_roles():
    facts = [
        {"company_id":"c", "field":"营业收入", "period":"2026-H1", "scope":"合并", "value_yuan":"100.00", "verification_status":"verified", "review_note":""},
        {"company_id":"c", "field":"营业收入", "period":"2026-H1", "scope":"合并", "value_yuan":"101.00", "verification_status":"verified", "review_note":""},
    ]
    assert all(f["verification_status"] == "conflicted" for f in mark_conflicts(facts))
    assert effective_status("verified", False, True, True) == "unverified"
    seed()
    client = TestClient(app)
    config = client.get("/api/use-cases").json()
    assert {'supplier-trade-credit', 'finance-manager-credit-terms', 'consumer-large-prepayment'} <= {p['id'] for p in config['use_cases']}
    assert config['default_use_case_id'] == 'consumer-large-prepayment'
    assert config["use_cases"][1]["output_template"]["sections"][0]["fields"][0] == "legal_name"
    assert client.get("/api/companies/halo-688173").json()["legal_name"] == "希荻微电子集团股份有限公司"
    assert client.get("/api/risk-events/event-zinitix-management/explanation").json()["mode"] == "offline"
    assert client.get("/api/sources/src-risk-20260903/candidates").json() == {"mode": "offline", "fallback": False, "candidates": []}


def test_model_excerpt_must_match_source(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "openai_compatible")
    monkeypatch.setenv("LLM_API_KEY", "test-placeholder")
    monkeypatch.setenv("LLM_MODEL", "test-model")
    monkeypatch.setattr(llm, "_call", lambda _prompt: json.dumps({"candidates": [{"entity": "Zinitix", "event_type": "风险", "event_date": "2026-09-03", "stage": "公告", "amount": None, "unit": None, "excerpt": "原文不存在的风险判断", "page": 1}]}))
    result = llm.extract_candidates("source", 1, "本页仅有原始事实。")
    assert result["candidates"] == []
