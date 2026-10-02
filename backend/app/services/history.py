"""Point-in-time views; future outcomes are a separate query, never a UI filter."""
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
from sqlalchemy import select, func
from app.db.models import ROOT, SessionLocal
from app.db.history import Entity, Document, DocumentPage, Fragment, Assertion, HistoricalEvent, Observation, MatchRun, PipelineRun

LIMITATIONS = ['按公开日期重建历史，不代表系统当时发出预警', '仅有日期的文档从次日零时可用，无法判断同日先后', '公开信息不等于付款历史或违约概率']


def version(db):
    values = list(db.execute(select(Document.id, Document.published_at, Document.available_at, Document.verification_status, Document.supersedes_id, Document.metadata_json).order_by(Document.id)))
    assertions = list(db.execute(select(Assertion.id, Assertion.status, Assertion.value_json, Assertion.fragment_id, Assertion.metadata_json).order_by(Assertion.id)))
    entities = list(db.execute(select(Entity.id, Entity.name, Entity.industry, Entity.metadata_json).order_by(Entity.id)))
    return hashlib.sha256(repr((values, assertions, entities)).encode()).hexdigest()[:16]


def entities(query='', page=1, page_size=20):
    with SessionLocal() as db:
        rows = list(db.scalars(select(Entity).order_by(Entity.ticker)))
        rows = [e for e in rows if query.lower() in (e.name + ' ' + (e.ticker or '')).lower()]
        return {'items': [{'id': e.id, 'name': e.name, 'ticker': e.ticker, 'industry': e.industry, 'cohort': e.cohort} for e in rows[(page-1)*page_size:page*page_size]], 'total': len(rows), 'dataset_version': version(db)}


def coverage(company_id):
    with SessionLocal() as db:
        e = db.get(Entity, company_id)
        if not e: raise KeyError(company_id)
        docs = list(db.scalars(select(Document).where(Document.company_id == company_id)))
        return {'company_id': company_id, 'documents': len(docs), 'local_available': sum((ROOT / d.local_file).is_file() for d in docs),
            'oldest_publication': min((d.published_at for d in docs), default=None), 'latest_publication': max((d.published_at for d in docs), default=None),
            'last_fetched_at': max((d.fetched_at for d in docs), default=None), 'last_reviewed_at': db.scalar(select(func.max(Assertion.reviewed_at)).where(Assertion.company_id == company_id)),
            'coverage_status': 'partial', 'unknowns': ['仅按配置抽样公告，未覆盖全部公告、法院和付款记录', '候选文档未全部提取与语义核对', '没有完成观察窗口的企业不作为无事件样本'],
            'selection': json.loads(e.metadata_json), 'dataset_version': version(db)}


def located_rows(db, company_id, as_of):
    rows = db.execute(select(Assertion, Fragment, Document).join(Fragment, Assertion.fragment_id == Fragment.id).join(Document, Fragment.document_id == Document.id).where(
        Assertion.company_id == company_id, Assertion.status.in_(['source_supported', 'human_reviewed']), Document.verification_status == 'source_supported', Document.available_at <= as_of)).all()
    result = []
    for assertion, fragment, doc in rows:
        if json.loads(doc.metadata_json).get('historical_availability_uncertain'):
            continue
        replacements = db.scalars(select(Document).where(Document.supersedes_id == doc.id, Document.available_at <= as_of)).all()
        if any(not json.loads(r.metadata_json).get('historical_availability_uncertain') for r in replacements):
            continue
        result.append((assertion, fragment, doc))
    return result


def snapshot(company_id, as_of):
    date.fromisoformat(as_of)
    with SessionLocal() as db:
        e = db.get(Entity, company_id)
        if not e: raise KeyError(company_id)
        docs = list(db.scalars(select(Document).where(Document.company_id == company_id, Document.available_at <= as_of).order_by(Document.published_at.desc())))
        docs = [d for d in docs if not json.loads(d.metadata_json).get('historical_availability_uncertain')]
        facts = []
        for a, f, d in located_rows(db, company_id, as_of):
            meta = json.loads(a.metadata_json)
            facts.append({'id': a.id, 'category': a.category, 'field': a.field, 'value': json.loads(a.value_json),
                'evidence_ids': [f.id], 'document_id': d.id, 'excerpt': f.excerpt, 'page': f.page, 'published_at': d.published_at,
                'available_at': d.available_at, 'verification_status': a.status, 'reviewer_type': a.reviewer_type,
                'reviewed_at': a.reviewed_at, 'affected_entity': meta.get('affected_entity', meta.get('entity_name')), 'issuer_name': meta.get('entity_name'),
                'period_end': meta.get('period_end'), 'scope': meta.get('scope'), 'unit': meta.get('unit'), 'audited': meta.get('audited'),
                'raw_value': meta.get('raw_value'), 'raw_unit': meta.get('raw_unit'), 'table_column': meta.get('table_column')})
        allowed = {a['id'] for a in facts}
        evs = list(db.scalars(select(HistoricalEvent).where(HistoricalEvent.company_id == company_id)))
        timeline = [{'id': v.id, 'assertion_id': v.assertion_id, 'event_type': v.event_type, 'stage': v.stage, 'occurred_at': v.occurred_at,
                     'effective_at': v.effective_at, 'affected_entity': json.loads(v.metadata_json).get('affected_entity')} for v in evs if v.assertion_id in allowed]
        # Current name is an identity label, explicitly not a historical alias reconstruction.
        historical_name = next((f['issuer_name'] for f in facts if f['issuer_name']), '证券代码 ' + (e.ticker or e.id) + '（当时全称未核对）')
        return {'company': {'id': e.id, 'name': historical_name, 'ticker': e.ticker, 'industry': e.industry, 'name_note': '名称来自当时可用断言；未核对则只显示代码'},
            'as_of': as_of, 'dataset_version': version(db), 'facts': facts, 'timeline': timeline,
            'documents': [{'id': d.id, 'title': d.title, 'published_at': d.published_at, 'verification_status': d.verification_status} for d in docs[:60]],
            'coverage': {'visible_document_count': len(docs), 'supported_assertion_count': len(facts), 'latest_visible_publication': max((d.published_at for d in docs), default=None)},
            'limitations': LIMITATIONS + ['本时点之外的结果、统计与来源不进入本响应', '未显示事实不等于未发生风险']}


def outcomes(company_id, as_of, window_days=180):
    start = date.fromisoformat(as_of)
    end = start + timedelta(days=window_days)
    with SessionLocal() as db:
        if not db.get(Entity, company_id): raise KeyError(company_id)
        rows = db.execute(select(Observation, HistoricalEvent, Assertion, Fragment, Document).join(HistoricalEvent, Observation.event_id == HistoricalEvent.id)
            .join(Assertion, HistoricalEvent.assertion_id == Assertion.id).join(Fragment, Assertion.fragment_id == Fragment.id)
            .join(Document, Fragment.document_id == Document.id).where(Observation.company_id == company_id,
                Document.available_at > as_of, Document.available_at <= end.isoformat(), Assertion.status == 'source_supported',
                Document.verification_status == 'source_supported', Observation.label == 'observed_positive')).all()
        rows = [r for r in rows if not json.loads(r[4].metadata_json).get('historical_availability_uncertain')]
        items = [{'id': o.id, 'outcome_type': o.outcome_type, 'stage': ev.stage, 'confirmed_at': d.published_at, 'occurred_at': ev.occurred_at,
                  'effective_at': ev.effective_at, 'evidence_ids': [f.id], 'document_id': d.id, 'page': f.page, 'excerpt': f.excerpt,
                  'rule_version': o.rule_version, 'affected_entity': json.loads(ev.metadata_json)['affected_entity']} for o, ev, a, f, d in rows]
        today = datetime.now(timezone(timedelta(hours=8))).date()
        state = 'observed_positive' if items else ('right_censored' if end > today else 'insufficient_coverage')
        return {'company_id': company_id, 'as_of': as_of, 'window_days': window_days, 'window_end': end.isoformat(), 'observation_status': state,
                'outcomes': items, 'dataset_version': version(db), 'limitations': ['结果按公开确认时间查询，实际发生时间另列', '无标签不等于没有事件；未完成系统性检索', '结果筛选案例不能用于估算违约概率']}


def document_info(document_id):
    with SessionLocal() as db:
        d = db.get(Document, document_id)
        if not d: raise KeyError(document_id)
        return {c.name: getattr(d, c.name) for c in Document.__table__.columns} | {'local_available': (ROOT / d.local_file).is_file()}


def search_pages(query, as_of, company_id=None):
    """Literal full-text substring search over locally extracted pages, not verified assertions."""
    escaped = query.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
    with SessionLocal() as db:
        stmt = select(DocumentPage, Document).join(Document, DocumentPage.document_id == Document.id).where(
            Document.available_at <= as_of, DocumentPage.text.like('%' + escaped + '%', escape='\\')).order_by(Document.published_at.desc(), Document.id, DocumentPage.page)
        if company_id: stmt = stmt.where(Document.company_id == company_id)
        items = []
        for p, d in db.execute(stmt.limit(200)):
            if json.loads(d.metadata_json).get('historical_availability_uncertain'): continue
            offset = p.text.lower().find(query.lower())
            items.append({'document_id': d.id, 'company_id': d.company_id, 'title': d.title, 'page': p.page,
                'published_at': d.published_at, 'snippet': p.text[max(0, offset-70):offset+len(query)+150], 'verification_status': 'candidate'})
            if len(items) == 30: break
        return {'query': query, 'as_of': as_of, 'items': items, 'limit': 30, 'dataset_version': version(db),
            'limitations': ['仅检索本地已解析文字；扫描页和跨行词语可能无法匹配', '命中片段为检索线索，不会自动变成已支持断言', '最多返回 30 项，不表示全文覆盖完整']}


def quality():
    with SessionLocal() as db:
        docs = list(db.scalars(select(Document)))
        statuses = dict(db.execute(select(Assertion.status, func.count()).group_by(Assertion.status)).all())
        labels = dict(db.execute(select(Observation.label, func.count()).join(HistoricalEvent, Observation.event_id == HistoricalEvent.id)
            .join(Assertion, HistoricalEvent.assertion_id == Assertion.id).where(Assertion.status == 'source_supported').group_by(Observation.label)).all())
        return {'dataset_version': version(db), 'entities': db.scalar(select(func.count()).select_from(Entity)), 'documents': len(docs),
            'unique_document_hashes': len({d.sha256 for d in docs}), 'local_documents': sum((ROOT / d.local_file).is_file() for d in docs),
            'parsed_documents': sum(d.extraction_status == 'text_available' for d in docs), 'supported_documents': sum(d.verification_status == 'source_supported' for d in docs),
            'assertion_statuses': statuses, 'events': db.scalar(select(func.count()).select_from(HistoricalEvent)), 'outcome_statuses': labels,
            'human_reviewed': db.scalar(select(func.count()).select_from(Assertion).where(Assertion.reviewer_type == 'human')),
            'publication_range': [min((d.published_at for d in docs), default=None), max((d.published_at for d in docs), default=None)],
            'last_fetched_at': max((d.fetched_at for d in docs), default=None), 'last_reviewed_at': db.scalar(select(func.max(Assertion.reviewed_at))),
            'limitations': ['历史案例经结果筛选；候选池不等于合格对照', '公告数量不等于已支持断言数量', '人工复核数只统计真实 human 记录，agent 不计入', '没有全市场覆盖或预测评估']}


def compare_entities(company_id, as_of, window_days=180):
    target = snapshot(company_id, as_of)
    # Rule v1 fixed before reading outcomes: same research industry; known size +/- log2;
    # same negative operating-cash signal and financial period. Missing features => reject.
    features = {f['field']: f for f in target['facts'] if f['category'] == 'financial'}
    excluded = []
    matches = []
    with SessionLocal() as db:
        candidates = list(db.scalars(select(Entity).where(Entity.id != company_id).order_by(Entity.id)))
    for e in candidates:
        reasons = []
        if e.industry != target['company']['industry']: reasons.append('研究行业分类不一致')
        other = snapshot(e.id, as_of)
        if not other['documents']: reasons.append('未找到此时点已公开的入池依据')
        cf = {f['field']: f for f in other['facts'] if f['category'] == 'financial'}
        needed = ['total_assets_yuan', 'operating_cashflow_yuan']
        if any(k not in features or k not in cf for k in needed): reasons.append('缺少当时可用的规模或现金流特征')
        if not reasons:
            import math
            ta, ca = float(features[needed[0]]['value']), float(cf[needed[0]]['value'])
            if ta <= 0 or ca <= 0: reasons.append('规模特征非正数')
            elif abs(math.log2(ca / ta)) > 1: reasons.append('规模相差超过两倍')
            if any(float(x['value']) >= 0 for x in [features[needed[1]], cf[needed[1]]]): reasons.append('不满足经营现金流为负的预设信号')
            if features[needed[1]]['period_end'] != cf[needed[1]]['period_end']: reasons.append('报告期不同')
            # Identity features must be evidence-linked and available at the matching time.
            meta = json.loads(e.metadata_json)
            with SessionLocal() as db:
                target_meta = json.loads(db.get(Entity, company_id).metadata_json)
            known = {f['id'] for f in other['facts']}
            target_known = {f['id'] for f in target['facts']}
            if meta.get('group_evidence_id') not in known or target_meta.get('group_evidence_id') not in target_known:
                reasons.append('集团独立性尚未核实')
            elif meta.get('group_id') == target_meta.get('group_id'):
                reasons.append('同一集团不能视为独立对照')
            if meta.get('observation_coverage') != 'complete' or target_meta.get('observation_coverage') != 'complete':
                reasons.append('未完成同等强度的观察覆盖')
            if not reasons:
                matches.append({'company_id': e.id, 'name': e.name, 'distance': abs(math.log2(ca / ta)), 'features': cf, 'snapshot': other})
        if reasons: excluded.append({'company_id': e.id, 'name': e.name, 'reasons': reasons})
    result = {'company_id': company_id, 'as_of': as_of, 'window_days': window_days, 'method_version': 'cashflow-industry-size-1',
        'status': 'matched' if matches else 'insufficient', 'matches': matches, 'excluded': excluded, 'candidate_count': len(candidates),
        'dataset_version': target['dataset_version'], 'limitations': ['未找到合格对照，不强配相反结果', '匹配不证明因果关系；尚未完成全候选池同强度观察'],
        'input_features': features}
    ident = hashlib.sha256(json.dumps(result, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:24]
    result['id'] = ident
    with SessionLocal.begin() as db:
        db.merge(MatchRun(id=ident, created_at=datetime.now(timezone.utc).isoformat(), input_json=json.dumps({'company_id': company_id, 'as_of': as_of, 'window_days': window_days}), result_json=json.dumps(result, ensure_ascii=False)))
    return result
