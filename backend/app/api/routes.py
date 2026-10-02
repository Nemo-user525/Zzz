import json
import os
from fastapi import APIRouter, HTTPException
from sqlalchemy import func
from app.db.models import Company, DemoScenario, Fact, RiskEvent, SessionLocal, Source, ROOT
from app.schemas.api import SimulationInput
from app.services.cashflow import compare, simulate
from app.services.llm import effective_mode, explain, extract_candidates
import pymupdf

router = APIRouter(prefix="/api")


def not_found(kind: str, ident: str):
    raise HTTPException(status_code=404, detail={"code": "not_found", "message": f"{kind}不存在: {ident}", "details": []})


def summary(row: Company) -> dict:
    return {k: getattr(row, k) for k in ("id", "legal_name", "ticker", "industry", "coverage", "updated_at")}


@router.get("/health")
def health():
    with SessionLocal() as db:
        company_count = db.query(func.count(func.distinct(Fact.company_id))).filter(Fact.verification_status == "verified").scalar() or 0
        source_count = db.query(func.count(func.distinct(Fact.source_id))).join(Source, Source.id == Fact.source_id).filter(Fact.verification_status == 'verified', Source.accessible == True).scalar() or 0
        as_of = db.query(func.max(Company.updated_at)).scalar()
    return {"status": "ok", "database_ready": True, "verified_company_count": company_count, "verified_source_count": source_count, "as_of": as_of, "llm_mode": effective_mode(), 'coverage_scope': 'legacy_demo_only', 'as_of_semantics': '旧演示企业最新资料公开日，不代表全库更新完成；研究库见 /api/v2/dataset/quality'}


@router.get("/demo-scenario")
def demo_scenario():
    with SessionLocal() as db:
        row = db.get(DemoScenario, "default")
        if not row:
            not_found("情景", "default")
        return json.loads(row.payload_json)


@router.get("/use-cases")
def use_cases():
    return json.loads((ROOT / "data/use_cases.json").read_text(encoding="utf-8"))


@router.get("/companies")
def companies(query: str = ""):
    with SessionLocal() as db:
        rows = db.query(Company).order_by(Company.id).all()
        return [summary(row) for row in rows if query.strip().lower() in (row.legal_name + row.short_name + (row.ticker or "")).lower()]


@router.get("/companies/{company_id}")
def company(company_id: str):
    with SessionLocal() as db:
        row = db.get(Company, company_id)
        if not row:
            not_found("公司", company_id)
        rules = json.loads((ROOT / 'data/legacy_evidence_rules.json').read_text(encoding='utf-8'))
        facts = [f for f in db.query(Fact).filter(Fact.company_id == company_id).order_by(Fact.id).all() if rules['facts'].get(f.id) == 'financial']
        financials = [{"id": f.id, "category": "financial", "page": f.page, "verification_method": "exact_text_and_legacy_review_attestation", "reviewer_note": "旧文件人工标记仅为历史自述，未具名复核", "field": f.field, "value_yuan": float(f.value_yuan) if f.value_yuan is not None else None, "period": f.period, "unit": f.unit, "source_id": f.source_id, "scope": f.scope, "audited": f.audited, "excerpt": f.excerpt, "verification_status": f.verification_status} for f in facts]
        return {**summary(row), "short_name": row.short_name, "uscc": row.uscc, "listed": row.listed, "financials": financials, "unknowns": rules['companies'].get(company_id, {}).get('unknowns', ['当前企业覆盖缺口尚未逐项复核'])}


@router.get("/companies/{company_id}/risk-events")
def risk_events(company_id: str):
    with SessionLocal() as db:
        if not db.get(Company, company_id):
            not_found("公司", company_id)
        rows = db.query(RiskEvent).filter(RiskEvent.company_id == company_id).all()
        return [{"id": r.id, "company_id": r.company_id, "affected_entity": r.affected_entity, "type": r.type, "event_date": r.event_date, "stage": r.stage, "amount_yuan": float(r.amount_yuan) if r.amount_yuan is not None else None, "status": r.status, "verification_status": r.verification_status, "source_ids": json.loads(r.source_ids_json), "explanation": r.explanation} for r in rows]


@router.get("/sources/{source_id}")
def source(source_id: str):
    with SessionLocal() as db:
        row = db.get(Source, source_id)
        if not row:
            not_found("来源", source_id)
        return {k: getattr(row, k) for k in ("id", "type", "institution", "title", "url", "notice_number", "published_at", "fetched_at", "page", "sha256", "accessible", "excerpt")} | {'fetch_status': 'not_checked_this_request', 'local_available': (ROOT / row.local_file).is_file(), 'integrity_status': 'matched_at_import' if row.accessible else 'failed_at_import', 'verification_status': 'legacy_assertions_checked_individually'}


@router.get('/sources/{source_id}/document')
def local_document(source_id: str):
    import hashlib
    from fastapi.responses import FileResponse
    with SessionLocal() as db:
        row = db.get(Source, source_id)
        if not row: not_found('来源', source_id)
        path = (ROOT / row.local_file).resolve()
        if not path.is_relative_to((ROOT / 'data/source_docs').resolve()) or not path.is_file():
            raise HTTPException(404, detail={'code':'local_document_missing','message':'本地原文未缓存','details':[]})
        if hashlib.sha256(path.read_bytes()).hexdigest().lower() != row.sha256.lower():
            raise HTTPException(409, detail={'code':'integrity_mismatch','message':'本地原文哈希不符','details':[]})
        return FileResponse(path, media_type='application/pdf', headers={'Content-Disposition':'inline','Cache-Control':'private, no-cache','X-Content-Type-Options':'nosniff'})


@router.get("/risk-events/{event_id}/explanation")
def event_explanation(event_id: str):
    with SessionLocal() as db:
        row = db.get(RiskEvent, event_id)
        if not row:
            not_found("事件", event_id)
        ids = json.loads(row.source_ids_json)
        src = db.get(Source, ids[0]) if ids else None
        event_data = {"affected_entity": row.affected_entity, "explanation": row.explanation}
        return explain(event_data, src.excerpt if src else "")


@router.get("/sources/{source_id}/candidates")
def source_candidates(source_id: str):
    with SessionLocal() as db:
        row = db.get(Source, source_id)
        if not row:
            not_found("来源", source_id)
        if effective_mode() == "offline":
            return {"mode": "offline", "fallback": False, "candidates": []}
        path = ROOT / row.local_file
        if not row.accessible or not path.is_file():
            return {"mode": "offline", "fallback": True, "candidates": []}
        with pymupdf.open(path) as doc:
            text = doc[row.page - 1].get_text()
        return extract_candidates(row.id, row.page, text)


def ensure_company(company_id: str):
    with SessionLocal() as db:
        if not db.get(Company, company_id):
            from app.db.history import Entity
            if not db.get(Entity, company_id):
                not_found("公司", company_id)


def verified_event_ids(company_id: str) -> list[str]:
    with SessionLocal() as db:
        return [r.id for r in db.query(RiskEvent).filter(RiskEvent.company_id == company_id, RiskEvent.verification_status == "verified").all()]


@router.post("/simulations")
def simulations(inp: SimulationInput):
    ensure_company(inp.company_id)
    return simulate(inp, evidence_event_ids=verified_event_ids(inp.company_id))


@router.post("/compare-scenarios")
def compare_scenarios(inp: SimulationInput):
    ensure_company(inp.company_id)
    return compare(inp, evidence_event_ids=verified_event_ids(inp.company_id))
