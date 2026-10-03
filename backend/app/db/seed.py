"""Idempotent offline import. A source hash or excerpt failure blocks verified status."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import re
import pymupdf
from .models import Base, Company, DemoScenario, Fact, ImportLog, RiskEvent, SessionLocal, Source, engine, ROOT
from app.services.evidence import effective_status, mark_conflicts
from .validation import load_inputs
from sqlalchemy import text


def _compact(value: str) -> str:
    return re.sub(r"\s+", "", value)


def verify_excerpt(pdf_path: Path, page_number: int, excerpt: str) -> bool:
    if not pdf_path.is_file():
        return False
    try:
        with pymupdf.open(pdf_path) as doc:
            if page_number < 1 or page_number > len(doc):
                return False
            page_text = _compact(doc[page_number - 1].get_text())
        return len(_compact(excerpt)) >= 8 and _compact(excerpt) in page_text
    except Exception:
        return False


def supports_event(event, facts):
    rules_file = ROOT / 'data/legacy_evidence_rules.json'
    rules = json.loads(rules_file.read_text(encoding='utf-8')).get('events', {}) if rules_file.exists() else {}
    rule = rules.get(event['id'])
    if not rule or any(event[k] != rule[k] for k in ('type', 'stage', 'affected_entity')):
        return False
    return any(f['id'] in rule['fact_ids'] and f['company_id'] == event['company_id'] and f['source_id'] in event['source_ids']
               and f['verification_status'] == 'verified' and all(t in _compact(f['excerpt']) for t in rule['required_tokens']) for f in facts)


def _seed() -> dict:
    from .history import migrate
    migrate(engine)
    manifest, records, scenario = load_inputs(ROOT)
    with SessionLocal.begin() as db:
        # Additive migration: refuses dirty legacy data; never deletes a SQLite file.
        if db.execute(text('PRAGMA foreign_key_check')).first():
            raise ValueError('现有 SQLite 有悬空外键，请修复后重试；原数据保留')
        duplicates = db.execute(text('SELECT lower(sha256), group_concat(id) FROM sources GROUP BY lower(sha256) HAVING count(*) > 1')).first()
        if duplicates:
            raise ValueError(f'现有 SQLite 存在重复哈希来源: {duplicates[1]}，需归并')
        db.execute(text('CREATE UNIQUE INDEX IF NOT EXISTS ux_sources_sha256 ON sources(lower(sha256))'))
        db.execute(text('CREATE INDEX IF NOT EXISTS ix_facts_company_status ON facts(company_id, verification_status)'))
        db.execute(text('CREATE INDEX IF NOT EXISTS ix_events_company ON risk_events(company_id)'))
        db.execute(text('DROP INDEX IF EXISTS ux_events_identity'))
        for record in records:
            db.merge(Company(**record['company']))
        db.flush()
        source_ok = {}
        for item in manifest:
            previous = db.get(Source, item['id'])
            if previous and (previous.url != item['url'] or previous.sha256.upper() != item['sha256'].upper()):
                raise ValueError(f"source_manifest.json/{item['id']}: 已有 ID 指向不同 URL/哈希；新公告请使用新 ID")
            path = ROOT / item["local_file"]
            actual = hashlib.sha256(path.read_bytes()).hexdigest().upper() if path.is_file() else ""
            ok = actual == item["sha256"].upper()
            source_ok[item["id"]] = ok
            db.merge(Source(**{k: item[k] for k in ("id", "type", "institution", "title", "url", "notice_number", "published_at", "fetched_at", "page", "sha256", "local_file", "excerpt")}, accessible=ok))
        db.flush()
        for src in db.query(Source).all():
            if src.id not in source_ok:
                path = ROOT / src.local_file
                actual = hashlib.sha256(path.read_bytes()).hexdigest().upper() if path.is_file() else ''
                src.accessible = actual == src.sha256.upper()
                source_ok[src.id] = src.accessible
        pending_facts = []
        for record, fact in ((r, f) for r in records for f in r['facts']):
            previous = db.get(Fact, fact['id'])
            if previous and previous.company_id != record['company']['id']:
                raise ValueError(f"{fact['id']}: 已有事实 ID 属于其他企业，不允许覆盖")
            item = dict(fact)
            item["company_id"] = record["company"]["id"]
            excerpt_ok = verify_excerpt(ROOT / next(s["local_file"] for s in manifest if s["id"] == item["source_id"]), item["page"], item["excerpt"])
            item["verification_status"] = effective_status(item["verification_status"], bool(source_ok.get(item["source_id"])), excerpt_ok, item["reviewed_by_human"])
            pending_facts.append(item)
        # Include legacy facts in conflicts and revalidate their changed sources.
        imported_ids = {f['id'] for f in pending_facts}
        for old in db.query(Fact).all():
            if old.id in imported_ids:
                continue
            item = {c.name: getattr(old, c.name) for c in Fact.__table__.columns}
            src = db.get(Source, old.source_id)
            item['verification_status'] = effective_status(old.verification_status, bool(src and src.accessible), bool(src and verify_excerpt(ROOT / src.local_file, old.page, old.excerpt)), old.reviewed_by_human)
            pending_facts.append(item)
        for item in mark_conflicts(pending_facts):
            db.merge(Fact(**item))
        db.flush()
        for event in (e for r in records for e in r['risk_events']):
            previous = db.get(RiskEvent, event['id'])
            if previous and previous.company_id != event['company_id']:
                raise ValueError(f"{event['id']}: 已有事件 ID 属于其他企业，不允许覆盖")
            item = dict(event)
            ids = item.pop("source_ids")
            token = re.split(r'[（(\s]', item['affected_entity'])[0].casefold()
            supported = supports_event(event, pending_facts)
            item["verification_status"] = effective_status(item["verification_status"], bool(ids) and all(source_ok.get(sid) for sid in ids), supported, supported)
            item["source_ids_json"] = json.dumps(ids)
            same_case = db.query(RiskEvent).filter(RiskEvent.company_id == item["company_id"], RiskEvent.affected_entity == item["affected_entity"], RiskEvent.type == item["type"], RiskEvent.event_date == item["event_date"], RiskEvent.source_ids_json == item['source_ids_json'], RiskEvent.stage == item['stage'], RiskEvent.explanation == item['explanation'], RiskEvent.id != item["id"]).first()
            if same_case:
                continue
            db.merge(RiskEvent(**item))
        db.flush()
        for event in db.query(RiskEvent).all():
            ids = json.loads(event.source_ids_json)
            token = re.split(r'[（(\s]', event.affected_entity)[0].casefold()
            supported = supports_event({'id': event.id, 'company_id': event.company_id, 'type': event.type, 'stage': event.stage, 'affected_entity': event.affected_entity, 'source_ids': ids}, pending_facts)
            if not supported or not ids or not all(db.get(Source, sid) and db.get(Source, sid).accessible for sid in ids):
                event.verification_status = 'unverified'
        db.merge(DemoScenario(id="default", payload_json=json.dumps(scenario, ensure_ascii=False)))
        counts = {"companies": db.query(Company).count(), "sources": db.query(Source).count(), "facts": db.query(Fact).count(), "risk_events": db.query(RiskEvent).count(), "verified_sources": db.query(Source).filter(Source.accessible == True).count()}
        db.add(ImportLog(imported_at=datetime.now(timezone.utc).isoformat(), summary=json.dumps({'status': 'success', 'counts': counts, 'input_files': len(records)})))
    return counts


def seed() -> dict:
    try:
        return _seed()
    except Exception as exc:
        # A failure is logged in its own transaction after all entity writes roll back.
        with SessionLocal.begin() as db:
            db.add(ImportLog(imported_at=datetime.now(timezone.utc).isoformat(), summary=json.dumps({'status': 'failed', 'error': str(exc)}, ensure_ascii=False)))
        raise


if __name__ == "__main__":
    print(seed())
