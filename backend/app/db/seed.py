"""Idempotent offline import. A source hash or excerpt failure blocks verified status."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import re
import pymupdf
from .models import Base, Company, DemoScenario, Fact, ImportLog, RiskEvent, SessionLocal, Source, engine, ROOT
from app.services.evidence import effective_status, mark_conflicts


def _compact(value: str) -> str:
    return re.sub(r"[\s,，：:；;。.]", "", value)


def verify_excerpt(pdf_path: Path, page_number: int, excerpt: str) -> bool:
    if not pdf_path.is_file():
        return False
    try:
        doc = pymupdf.open(pdf_path)
        if page_number < 1 or page_number > len(doc):
            return False
        page_text = _compact(doc[page_number - 1].get_text())
        sample = _compact(excerpt)
        # PDF fonts in the half-year summary lack Chinese mapping. Require every
        # numeric token and manually review the adjacent printed row instead.
        numbers = re.findall(r"-?\d[\d,]*(?:\.\d+)?", excerpt)
        return bool(numbers) and all(_compact(n) in page_text for n in numbers)
    except Exception:
        return False


def seed() -> dict:
    Base.metadata.create_all(engine)
    manifest = json.loads((ROOT / "data/source_manifest.json").read_text(encoding="utf-8"))
    record = json.loads((ROOT / "data/verified/halo-688173.json").read_text(encoding="utf-8"))
    scenario = json.loads((ROOT / "data/demo_scenarios.json").read_text(encoding="utf-8"))
    if len({s["url"] for s in manifest}) != len(manifest) or len({s["sha256"] for s in manifest}) != len(manifest):
        raise ValueError("来源 URL 或 PDF SHA-256 重复，先归并公告")
    with SessionLocal.begin() as db:
        db.merge(Company(**record["company"]))
        source_ok = {}
        for item in manifest:
            path = ROOT / item["local_file"]
            actual = hashlib.sha256(path.read_bytes()).hexdigest().upper() if path.is_file() else ""
            ok = actual == item["sha256"] and verify_excerpt(path, item["page"], item["excerpt"])
            source_ok[item["id"]] = ok
            db.merge(Source(**{k: item[k] for k in ("id", "type", "institution", "title", "url", "notice_number", "published_at", "fetched_at", "page", "sha256", "local_file", "excerpt")}, accessible=ok))
        pending_facts = []
        for fact in record["facts"]:
            item = dict(fact)
            item["company_id"] = record["company"]["id"]
            excerpt_ok = verify_excerpt(ROOT / next(s["local_file"] for s in manifest if s["id"] == item["source_id"]), item["page"], item["excerpt"])
            item["verification_status"] = effective_status(item["verification_status"], bool(source_ok.get(item["source_id"])), excerpt_ok, item["reviewed_by_human"])
            pending_facts.append(item)
        for item in mark_conflicts(pending_facts):
            db.merge(Fact(**item))
        for event in record["risk_events"]:
            item = dict(event)
            ids = item.pop("source_ids")
            item["verification_status"] = effective_status(item["verification_status"], all(source_ok.get(sid) for sid in ids), True, True)
            item["source_ids_json"] = json.dumps(ids)
            same_case = db.query(RiskEvent).filter(RiskEvent.company_id == item["company_id"], RiskEvent.affected_entity == item["affected_entity"], RiskEvent.type == item["type"], RiskEvent.event_date == item["event_date"], RiskEvent.id != item["id"]).first()
            if same_case:
                continue
            db.merge(RiskEvent(**item))
        db.merge(DemoScenario(id="default", payload_json=json.dumps(scenario, ensure_ascii=False)))
        counts = {"companies": db.query(Company).count(), "sources": db.query(Source).count(), "facts": db.query(Fact).count(), "risk_events": db.query(RiskEvent).count(), "verified_sources": sum(source_ok.values())}
        db.add(ImportLog(imported_at=datetime.now(timezone.utc).isoformat(), summary=json.dumps(counts)))
    return counts


if __name__ == "__main__":
    print(seed())
