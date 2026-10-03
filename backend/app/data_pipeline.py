"""Bounded, restartable public-disclosure pipeline. python -m app.data_pipeline --help"""
import argparse
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import uuid
import pymupdf
from sqlalchemy import select
from app.db.models import ROOT, SessionLocal
from app.db.history import Entity, Document, DocumentPage, Fragment, Assertion, HistoricalEvent, Observation, PipelineRun, migrate
from app.services.acquisition import Cninfo

VERSION = 'research-2.0'


def now():
    return datetime.now(timezone.utc).isoformat()


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    tmp.replace(path)


def compact(s):
    # Preserve minus, decimal, punctuation and conditional semantics.
    return re.sub(r'\s+', '', s)


def check_event_claim(claim):
    rules = {
        'delisting_notice': ('事先告知', ['收到', '事先告知书']),
        'delisting_decided': ('终止上市决定', ['决定', '终止', '上市']),
        'regulatory_penalty': ('行政处罚决定已收到', ['收到', '行政处罚决定书']),
        'restructuring_plan_approved': ('重整计划批准', ['裁定批准', '重整计划']),
        'restructuring_completed': ('重整计划执行完毕', ['裁定确认', '已执行完毕']),
        'subsidiary_management_notice': ('子公司管理股指定预告', ['Zinitix', '指定为管理股']),
    }
    event_type = claim.get('event_type')
    if not event_type: return
    if event_type not in rules:
        raise ValueError('事件类型尚无经过测试的标签规则')
    stage, tokens = rules[event_type]
    excerpt = compact(claim['excerpt'])
    if claim['stage'] != stage or any(t not in excerpt for t in tokens):
        raise ValueError('事件阶段或断言不受原文语义支持')
    if claim.get('is_outcome') and event_type in ('delisting_notice', 'subsidiary_management_notice'):
        raise ValueError('事先告知不是已发生结果')
    if claim.get('is_outcome') and re.search(r'未发生|可能|尚未|不予受理|已经偿付|风险提示|拟终止|如.{0,40}将', excerpt):
        raise ValueError('否定、条件和风险提示不能支持正向结果')


def read(path, default=None):
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else default


def discover(args):
    cfg = read(ROOT / args.config)
    adapter = Cninfo()
    catalog = adapter.catalog()
    dump(ROOT / 'data/raw/company_catalog.json', {'fetched_at': now(), 'source': 'https://www.cninfo.com.cn/new/data/szse_stock.json', 'items': catalog})
    queue = read(ROOT / 'data/manifests/discovered.json', [])
    keys = {r['announcement_id'] for r in queue}
    checks = []
    for entry in cfg['companies']:
        if args.company and entry['ticker'] != args.company:
            continue
        stock = next((s for s in catalog if s['code'] == entry['ticker']), None)
        if not stock:
            checks.append({'company': entry['ticker'], 'status': 'empty', 'reason': '目录未找到，不能确认主体'})
            continue
        entity_id = 'halo-688173' if stock['code'] == '688173' else 'cninfo-' + stock['orgId']
        with SessionLocal.begin() as db:
            entity = db.get(Entity, entity_id)
            if not entity:
                db.add(Entity(id=entity_id, name=stock['zwjc'], ticker=stock['code'], org_id=stock['orgId'],
                              industry=entry['industry'], cohort=entry['cohort'], metadata_json=json.dumps({
                                  'name_status': 'catalog_short_name', 'selection_reason': entry['reason'],
                                  'aliases': [{'name': stock['zwjc'], 'valid_from': None, 'valid_to': None}],
                                  'historical_membership_uncertain': True, 'industry_basis': 'research_sampling_category'}, ensure_ascii=False)))
        for query in entry.get('queries', cfg['queries']):
            added = 0
            selected = 0
            try:
                for page in range(1, cfg.get('max_pages', 2) + 1):
                    rows, more = adapter.announcements(stock=stock['code'] + ',' + stock['orgId'],
                        start=query.get('start', cfg['start']), end=query.get('end', cfg['end']), keyword=query['keyword'], page=page)
                    for row in rows:
                        selected += 1
                        if row['announcement_id'] not in keys:
                            queue.append(row | {'company_id': entity_id, 'discovered_at': now()})
                            keys.add(row['announcement_id']); added += 1
                        if selected >= query.get('limit', 10):
                            break
                    dump(ROOT / 'data/manifests/discovered.json', queue)
                    if not more or selected >= query.get('limit', 10):
                        break
                checks.append({'company': stock['code'], 'query': query, 'status': 'success' if rows else 'empty', 'added': added, 'selected': selected, 'checked_at': now(), 'complete_search': not more and len(rows) <= selected})
            except Exception as exc:
                checks.append({'company': stock['code'], 'query': query, 'status': 'blocked' if isinstance(exc, PermissionError) else 'failed', 'reason': str(exc)[:200]})
        print(stock['code'], added, flush=True)
    old_checks = read(ROOT / 'data/manifests/discovery_checks.json', [])
    checked_companies = {c['company'] for c in checks}
    dump(ROOT / 'data/manifests/discovery_checks.json', [c for c in old_checks if c['company'] not in checked_companies] + checks)
    return {'discovered_total': len(queue), 'queries': len(checks), 'failed': sum(x['status'] in ('failed', 'blocked') for x in checks)}


def fetch(args):
    adapter = Cninfo()
    queue = read(ROOT / 'data/manifests/discovered.json', [])
    done = failed = skipped = 0
    failures = []
    for item in queue:
        if args.company and item['ticker'] != args.company:
            continue
        with SessionLocal() as db:
            previous = db.scalars(select(Document).where(Document.announcement_id == item['announcement_id']).order_by(Document.fetched_at)).all()
            if args.resume and any((ROOT / d.local_file).is_file() and hashlib.sha256((ROOT / d.local_file).read_bytes()).hexdigest() == d.sha256 for d in previous):
                skipped += 1
                continue
        if done + failed >= args.max_documents:
            break
        try:
            content, sha = adapter.download(item['url'])
            if any(d.sha256 == sha for d in previous):
                # Identical content must not erase prior extraction/review state.
                cached = next(d for d in previous if d.sha256 == sha)
                path = ROOT / cached.local_file
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(content)
                skipped += 1
                continue
            version_id = item['announcement_id'] + '-' + sha[:16]
            dest = ROOT / 'data/raw/documents' / (sha + '.pdf')
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(content)
            with pymupdf.open(dest) as pdf:
                if len(pdf) == 0:
                    raise ValueError('PDF 没有页面')
            with SessionLocal.begin() as db:
                db.merge(Document(id=version_id, announcement_id=item['announcement_id'], company_id=item['company_id'],
                    title=item['title'], url=item['url'], published_at=item['published_at'],
                    available_at=(date.fromisoformat(item['published_at']) + timedelta(days=1)).isoformat(),
                    fetched_at=now(), sha256=sha, local_file=dest.relative_to(ROOT).as_posix(), fetch_status='success',
                    integrity_status='hash_recorded', extraction_status='pending', verification_status='candidate',
                    supersedes_id=previous[-1].id if previous and previous[-1].sha256 != sha else None,
                    metadata_json=json.dumps({'time_precision': 'day', 'historical_availability_uncertain': bool(previous and previous[-1].sha256 != sha),
                                             'institution': '发行人 / 巨潮资讯', 'redistribution': 'not_authorized_for_bulk_redistribution'})))
            done += 1
        except Exception as exc:
            failed += 1
            failures.append({'announcement_id': item['announcement_id'], 'reason': str(exc)[:200]})
        if (done + failed) % 10 == 0:
            print('fetch', done, 'failed', failed, flush=True)
    dump(ROOT / 'data/manifests/fetch_failures.json', failures)
    return {'downloaded': done, 'failed': failed, 'skipped_verified_hash': skipped}


def extract(args):
    extracted = 0
    with SessionLocal.begin() as db:
        for doc in db.scalars(select(Document).order_by(Document.id)):
            dest = ROOT / 'data/extracted' / (doc.id + '.json')
            if args.resume and dest.exists() and doc.extraction_status == 'text_available' and db.get(DocumentPage, (doc.id, 1)):
                continue
            path = ROOT / doc.local_file
            if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != doc.sha256:
                doc.integrity_status = 'mismatch_or_missing'; doc.verification_status = 'insufficient'
                continue
            with pymupdf.open(path) as pdf:
                pages = [{'page': i + 1, 'text': p.get_text(), 'blocks': [list(b[:5]) for b in p.get_text('blocks')]} for i, p in enumerate(pdf)]
            has_text = any(len(compact(p['text'])) > 40 for p in pages)
            for p in pages:
                db.merge(DocumentPage(document_id=doc.id, page=p['page'], text=p['text'], extraction_method='pymupdf-text'))
            doc.extraction_status = 'text_available' if has_text else 'needs_ocr'
            dump(dest, {'document_id': doc.id, 'sha256': doc.sha256, 'method': 'pymupdf-text', 'pages': pages})
            extracted += 1
    return {'extracted': extracted, 'ocr_provider': os.getenv('OCR_PROVIDER', 'disabled'), 'note': 'OCR 未配置时保留待复核，不伪造文字'}


def import_pdf(args):
    """Manual originals remain candidates until explicit validation; never bypass access controls."""
    if not args.file or not args.metadata:
        raise ValueError('import-pdf 需要 --file 原文路径 --metadata 元数据 JSON')
    from urllib.parse import urlparse
    meta = read(Path(args.metadata))
    for field in ('company_id', 'announcement_id', 'title', 'url', 'published_at', 'institution', 'usage_note'):
        if not isinstance(meta.get(field), str) or not meta[field].strip(): raise ValueError('缺少元数据字段 ' + field)
    url = urlparse(meta['url'])
    if url.scheme != 'https' or not url.hostname or url.username or url.password:
        raise ValueError('需保存不含凭据的 HTTPS 原始出处；本命令不会请求该网址')
    pub = date.fromisoformat(meta['published_at'])
    path = Path(args.file)
    if path.stat().st_size > 20 * 1024 * 1024: raise ValueError('PDF 超过 20 MiB 限制')
    content = path.read_bytes()
    if not content.startswith(b'%PDF-'): raise ValueError('只接受 PDF 原文')
    with pymupdf.open(stream=content, filetype='pdf') as pdf:
        if not len(pdf): raise ValueError('PDF 没有页面')
    sha = hashlib.sha256(content).hexdigest()
    ident = 'manual-' + hashlib.sha256((meta['announcement_id'] + ':' + sha).encode()).hexdigest()[:32]
    dest = ROOT / 'data/raw/documents' / (sha + '.pdf')
    with SessionLocal.begin() as db:
        if not db.get(Entity, meta['company_id']): raise ValueError('主体 ID 未入库，请先核对主体身份')
        existing = db.scalar(select(Document).where(Document.announcement_id == meta['announcement_id'], Document.sha256 == sha))
        if existing: return {'status': 'already_imported', 'document_id': existing.id}
        dest.parent.mkdir(parents=True, exist_ok=True); dest.write_bytes(content)
        db.add(Document(id=ident, announcement_id=meta['announcement_id'], company_id=meta['company_id'], title=meta['title'], url=meta['url'],
            published_at=pub.isoformat(), available_at=(pub+timedelta(days=1)).isoformat(), fetched_at=now(), sha256=sha,
            local_file=dest.relative_to(ROOT).as_posix(), fetch_status='manual_import', integrity_status='hash_recorded', extraction_status='pending',
            verification_status='candidate', metadata_json=json.dumps(meta | {'reviewer_type': 'unreviewed', 'historical_availability_uncertain': True}, ensure_ascii=False)))
    return {'status': 'candidate', 'document_id': ident, 'sha256': sha, 'next': '人工核对公开时间与版本后，extract / curated / validate；不自动进入严格回放'}


def validate(args):
    """Only explicit, source-located curator claims become supported. Agent != human."""
    claims = read(ROOT / 'data/curated/assertions.json', [])
    ids = [c['id'] for c in claims]
    if len(ids) != len(set(ids)):
        raise ValueError('curated/assertions.json 存在重复断言 ID；本次未写入')
    accepted = 0
    rejected = []
    with SessionLocal.begin() as db:
        # Revalidation is atomic, and stale/missing evidence cannot retain a supported badge.
        for old in db.scalars(select(Assertion)):
            old.status = 'insufficient'
        for claim in claims:
            try:
                doc = db.scalar(select(Document).where(Document.announcement_id == claim['announcement_id']).order_by(Document.fetched_at.desc()))
                if doc is None:
                    raise ValueError('未下载指定公告')
                path = ROOT / doc.local_file
                if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != doc.sha256:
                    raise ValueError('原文缺失或哈希不符')
                if claim.get('expected_sha256') != doc.sha256:
                    raise ValueError('文档版本与核对记录不同，不能继承旧核验状态')
                # Re-read the hash-checked original; editable extraction caches cannot certify a claim.
                with pymupdf.open(path) as pdf:
                    if not isinstance(claim['page'], int) or not 1 <= claim['page'] <= len(pdf):
                        raise ValueError('引用页码不在原文范围内')
                    text = pdf[claim['page'] - 1].get_text()
                    identity_text = ''.join(pdf[i].get_text() for i in range(min(2, len(pdf))))
                if compact(claim['excerpt']) not in compact(text):
                    raise ValueError('摘录无法逐字定位；数字相同不充分')
                if compact(claim['entity_name']) not in compact(identity_text):
                    raise ValueError('法律主体未定位')
                if claim.get('reviewer_type') != 'agent':
                    raise ValueError('本轮只允许真实 agent 复核，不生成 human 记录')
                if claim.get('category') == 'financial':
                    from decimal import Decimal
                    factors = {'元': 1, '千元': 1000, '万元': 10000, '亿元': 100000000}
                    if claim.get('raw_unit') not in factors or compact(claim['unit_context']) not in compact(text):
                        raise ValueError('金额单位没有对应页内表头支持')
                    if compact(claim['raw_value']) not in compact(claim['excerpt']):
                        raise ValueError('原始金额不在本条摘录内')
                    labels = {'total_assets_yuan': '总资产', 'revenue_yuan': '营业收入', 'operating_cashflow_yuan': '经营活动产生的现金流量净额'}
                    locator = claim['table_locator']
                    if labels.get(claim['field']) != locator['row_label']:
                        raise ValueError('指标与表格行不一致')
                    with pymupdf.open(path) as pdf:
                        page = pdf[claim['page'] - 1]
                        for rect_key, expected in [('value_bbox', claim['raw_value']), ('metric_bbox', locator['row_label']), ('header_bbox', locator['column_label'])]:
                            if compact(page.get_textbox(locator[rect_key])) != compact(expected):
                                raise ValueError('表格单元格或表头定位不一致：' + rect_key)
                    left, right = locator['column_range']
                    cell = locator['value_bbox']; header = locator['header_bbox']; metric = locator['metric_bbox']
                    if not (left <= cell[0] < cell[2] <= right and left <= header[0] < header[2] <= right and header[3] < cell[1] and metric[0] < cell[0] and metric[1] < cell[3] and metric[3] > cell[1]):
                        raise ValueError('数值不在选定当期列及指标行内')
                    expected_column = '本报告期末' if claim['field'] == 'total_assets_yuan' else '本报告期'
                    if locator['column_label'] != expected_column:
                        raise ValueError('不是本报告期对应列')
                    if Decimal(str(claim['value'])) != Decimal(claim['raw_value'].replace(',', '')) * factors[claim['raw_unit']]:
                        raise ValueError('原始金额与人民币元换算不一致')
                    if Decimal(str(claim['value'])).quantize(Decimal('.01')) != Decimal(str(claim['value'])):
                        raise ValueError('人民币金额超过分精度')
                    if compact(claim['report_title']) not in compact(doc.title):
                        raise ValueError('报告期与文档标题不一致')
                    year = re.search(r'(20\d{2})', claim['report_title']).group(1)
                    expected_period = year + ('-06-30' if '半年度' in claim['report_title'] else '-12-31')
                    if claim.get('period_end') != expected_period:
                        raise ValueError('财报期末不能由其他报告期替代')
                if any(token not in compact(claim['excerpt']) for token in claim.get('required_tokens', [])):
                    raise ValueError('事件语义锚点不完整')
                if claim.get('event_type') and not claim.get('required_tokens'):
                    raise ValueError('事件需要具体断言锚点')
                check_event_claim(claim)
                if claim.get('event_type') in ('debt_default', 'restructuring_accepted', 'delisting_decided') and re.search(r'未发生|可能|尚未|不予受理|已经偿付|风险提示|拟终止', claim['excerpt']):
                    raise ValueError('否定、条件或拟议语义不能支持已发生结果')
                fragment_id = claim['id'] + ':' + doc.sha256[:16]
                db.merge(Fragment(id=fragment_id, document_id=doc.id, page=claim['page'], excerpt=claim['excerpt'], method='exact_text_agent_review',
                                  locator_json=json.dumps({'normalized_offset': compact(text).index(compact(claim['excerpt'])), 'normalization': 'whitespace_only', 'table': claim.get('table_locator')})))
                db.flush()
                entity = db.get(Entity, doc.company_id)
                entity.name = claim['entity_name']
                db.merge(Assertion(id=claim['id'], company_id=doc.company_id, fragment_id=fragment_id, category=claim.get('category', 'event'),
                    field=claim['field'], value_json=json.dumps(claim.get('value'), ensure_ascii=False), status='source_supported',
                    reviewer_type='agent', reviewed_at=claim['reviewed_at'], metadata_json=json.dumps(claim, ensure_ascii=False)))
                db.flush()
                if claim.get('event_type'):
                    identity = claim.get('case_identity', doc.announcement_id) + ':' + claim['event_type'] + ':' + doc.company_id
                    db.merge(HistoricalEvent(id='event:' + claim['id'], company_id=doc.company_id, assertion_id=claim['id'], identity_key=identity,
                        event_type=claim['event_type'], stage=claim['stage'], occurred_at=claim.get('occurred_at'), effective_at=claim.get('effective_at'),
                        metadata_json=json.dumps({'affected_entity': claim.get('affected_entity', claim['entity_name']), 'is_outcome': claim.get('is_outcome', False), 'progress_of': claim.get('progress_of')}, ensure_ascii=False)))
                doc.verification_status = 'source_supported'
                accepted += 1
            except (ValueError, KeyError, IndexError, TypeError) as exc:
                rejected.append({'id': claim.get('id'), 'reason': str(exc)})
        for d in db.scalars(select(Document)):
            if not db.scalar(select(Assertion.id).join(Fragment, Assertion.fragment_id == Fragment.id).where(Fragment.document_id == d.id, Assertion.status == 'source_supported')):
                d.verification_status = 'candidate'
    dump(ROOT / 'data/review_queue/rejected.json', rejected)
    return {'supported': accepted, 'rejected': len(rejected), 'human_reviewed': 0}


def build_labels(args):
    count = 0
    with SessionLocal.begin() as db:
        for old in db.scalars(select(Observation)):
            old.label = 'insufficient_coverage'
        for entity in db.scalars(select(Entity)):
            events = db.execute(select(HistoricalEvent, Assertion, Fragment, Document).join(Assertion, HistoricalEvent.assertion_id == Assertion.id).join(Fragment, Assertion.fragment_id == Fragment.id).join(Document, Fragment.document_id == Document.id).where(HistoricalEvent.company_id == entity.id, Assertion.status == 'source_supported')).all()
            for ev, assertion, fragment, doc in events:
                if not json.loads(ev.metadata_json).get('is_outcome'):
                    continue
                start = date.fromisoformat(doc.published_at) - timedelta(days=180)
                db.merge(Observation(id='label:' + ev.id, company_id=entity.id, event_id=ev.id, start_at=start.isoformat(), end_at=doc.published_at,
                    label='observed_positive', outcome_type=ev.event_type, confirmed_at=doc.published_at, rule_version='labels-1',
                    coverage_json=json.dumps({'evidence_ids': [fragment.id], 'dataset_kind': 'outcome_selected_case', 'limitations': ['结果筛选案例，不可估计市场概率', '确认日为本库原始文档公开日，未证实全网最早公开时刻']})))
                count += 1
    return {'positive_labels': count, 'negative_labels': 0, 'note': '没有系统性完成观察的企业不能生成负标签'}


def run(args):
    migrate()
    if os.getenv('INGEST_MAX_CONCURRENCY', '1') != '1':
        raise ValueError('当前来源适配器只支持串行限速，请设置 INGEST_MAX_CONCURRENCY=1')
    if args.command == 'doctor':
        adapter = Cninfo()
        try:
            rows = adapter.catalog()
            return {'database': 'ready', 'cninfo': 'available', 'catalog_count': len(rows), 'llm': 'optional', 'ocr': os.getenv('OCR_PROVIDER', 'disabled')}
        except Exception as exc:
            return {'database': 'ready', 'cninfo': 'blocked_or_failed', 'reason': str(exc)[:200]}
    functions = {'discover': discover, 'fetch': fetch, 'extract': extract, 'validate': validate, 'build-labels': build_labels, 'import-pdf': import_pdf}
    if args.command in functions:
        return functions[args.command](args)
    from app.services.history import quality, compare_entities
    if args.command == 'build-comparisons':
        cfg = read(ROOT / args.config)
        results = [compare_entities(**x) for x in cfg.get('comparisons', [])]
        dump(ROOT / 'data/exports/comparisons.json', results)
        return results
    if args.command in ('quality-report', 'export-demo'):
        data = quality()
        dump(ROOT / 'data/exports/quality.json', data)
        with SessionLocal() as db:
            # Rebuild manifest contains metadata + short curated excerpts, never media full text.
            entities = [{c.name: getattr(e, c.name) for c in Entity.__table__.columns} for e in db.scalars(select(Entity))]
            documents = [{c.name: getattr(d, c.name) for c in Document.__table__.columns} for d in db.scalars(select(Document))]
        dump(ROOT / 'data/manifests/collected.json', {'entities': entities, 'documents': documents})
        return data
    if args.command == 'restore':
        data = read(ROOT / 'data/manifests/collected.json', {})
        with SessionLocal.begin() as db:
            for e in data.get('entities', []):
                metadata = json.loads(e.get('metadata_json', '{}'))
                metadata.pop('legal_name_candidate', None); metadata.pop('identity_evidence_document_id', None)
                db.merge(Entity(**(e | {'metadata_json': json.dumps(metadata, ensure_ascii=False)})))
            db.flush()
            for d in sorted(data.get('documents', []), key=lambda d: (d['fetched_at'], d['id'])):
                # Metadata restoration alone cannot certify local evidence.
                d = d | {'verification_status': 'candidate', 'extraction_status': 'pending'}
                db.merge(Document(**d))
                db.flush()
        return {'restored_metadata': len(data.get('documents', [])), 'next': 'fetch --resume; extract --resume; validate; build-labels'}
    raise ValueError('未知命令')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['doctor', 'discover', 'fetch', 'extract', 'validate', 'build-labels', 'build-comparisons', 'quality-report', 'export-demo', 'restore', 'import-pdf'])
    parser.add_argument('--config', default='configs/universe.json')
    parser.add_argument('--company')
    parser.add_argument('--resume', action='store_true')
    parser.add_argument('--file')
    parser.add_argument('--metadata')
    parser.add_argument('--max-documents', type=int, default=int(os.getenv('INGEST_MAX_DOCUMENTS', '220')))
    args = parser.parse_args()
    if not 1 <= args.max_documents <= 2000:
        parser.error('--max-documents 必须介于 1 与 2000')
    started = now()
    try:
        result = run(args)
        status = 'partial' if isinstance(result, dict) and (result.get('failed') or result.get('rejected')) else 'success'
    except Exception as exc:
        result = {'error_type': type(exc).__name__, 'message': str(exc)[:300]}; status = 'failed'
    config_path = ROOT / args.config
    details = {'result': result, 'arguments': vars(args), 'config_sha256': hashlib.sha256(config_path.read_bytes()).hexdigest() if config_path.is_file() else None, 'pipeline_version': VERSION}
    record = {'id': str(uuid.uuid4()), 'command': args.command, 'started_at': started, 'status': status, 'details_json': json.dumps(details, ensure_ascii=False)}
    with SessionLocal.begin() as db: db.add(PipelineRun(**record))
    dump(ROOT / 'data/manifests/runs' / (record['id'] + '.json'), record)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if status == 'failed': raise SystemExit(1)
    if status == 'partial': raise SystemExit(2)


if __name__ == '__main__':
    main()
