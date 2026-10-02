import hashlib
import importlib
import json
from datetime import date
from decimal import Decimal
from pathlib import Path
import pymupdf
import pytest
from sqlalchemy import create_engine, select, event
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient
from app.db.models import Base, ROOT
from app.db.history import Entity, Document, DocumentPage, Fragment, Assertion, HistoricalEvent, migrate
from app.services import history, llm
from app.services.acquisition import safe_url
from app.db.seed import verify_excerpt, supports_event
from app.schemas.api import SimulationInput
from app.services.cashflow import simulate, compare
from app.main import app


@pytest.fixture
def research(tmp_path, monkeypatch):
    eng = create_engine('sqlite:///' + str(tmp_path / 'research.sqlite3'))
    @event.listens_for(eng, 'connect')
    def fk(conn, _): conn.execute('PRAGMA foreign_keys=ON')
    Base.metadata.create_all(eng)
    sessions = sessionmaker(bind=eng)
    monkeypatch.setattr(history, 'SessionLocal', sessions)
    monkeypatch.setattr(history, 'ROOT', tmp_path)
    import app.api.history as routes
    monkeypatch.setattr(routes, 'ROOT', tmp_path)
    with sessions.begin() as db:
        db.add(Entity(id='one', name='未来名称不能当历史别名', ticker='TEST', org_id='test', industry='测试行业', cohort='test', metadata_json='{}'))
        db.flush()
        for ident, pub, available in [('early','2023-04-22','2023-04-23'),('future','2023-06-01','2023-06-02')]:
            path=tmp_path / 'data/raw/documents' / (ident+'.pdf');path.parent.mkdir(parents=True,exist_ok=True)
            pdf=pymupdf.open();pdf.new_page().insert_text((30,50),'Example Company evidence');pdf.save(path)
            sha=hashlib.sha256(path.read_bytes()).hexdigest()
            db.add(Document(id=ident, announcement_id=ident, company_id='one', title=ident, url='https://static.cninfo.com.cn/'+ident+'.PDF',
                published_at=pub, available_at=available, fetched_at='2026-10-02', sha256=sha, local_file=path.relative_to(tmp_path).as_posix(),
                fetch_status='success', integrity_status='hash_recorded', extraction_status='text_available', verification_status='source_supported', metadata_json='{}'))
            db.flush()
            db.add(Fragment(id='fragment-'+ident, document_id=ident, page=1, excerpt=ident, locator_json='{}', method='test'))
            db.flush()
            db.add(Assertion(id='assertion-'+ident, company_id='one', fragment_id='fragment-'+ident, category='event', field=ident, value_json='null',status='source_supported',reviewer_type='agent',reviewed_at='2026-10-02',metadata_json=json.dumps({'entity_name':'Example Company'})))
            db.flush()
            db.add(HistoricalEvent(id='event-'+ident, company_id='one', assertion_id='assertion-'+ident, identity_key=ident, event_type='notice', stage=ident, occurred_at='2023-01-01',metadata_json=json.dumps({'affected_entity':'Example Company','is_outcome':ident=='future'})))
    yield sessions, tmp_path
    eng.dispose()


def test_false_excerpt_with_same_numbers_rejected():
    assert not verify_excerpt(ROOT / 'data/source_docs/subsidiary_risk_2026-09-03.pdf',1,'某完全不相关企业已于2026年9月3日破产。')
    assert verify_excerpt(ROOT / 'data/source_docs/subsidiary_risk_2026-09-03.pdf',1,'Zinitix将于2026年9月3日起被韩国交易所指定为管理股')


def test_empty_or_unrelated_support_cannot_create_event():
    e={'id':'event-zinitix-management','company_id':'halo-688173','source_ids':[], 'type':'控股子公司上市地位风险','stage':'管理股指定','affected_entity':'Zinitix Co., Ltd.（控股子公司）'}
    assert not supports_event(e,[])
    e['source_ids']=['src-risk-20260903']
    unrelated={'id':'fact-revenue','company_id':'halo-688173','source_id':'src-risk-20260903','verification_status':'verified','excerpt':'Zinitix 营业收入 2026'}
    assert not supports_event(e,[unrelated])
    e['stage']='已退市'
    assert not supports_event(e,[dict(unrelated,id='fact-zinitix-status',excerpt='Zinitix将于2026年9月3日起被指定为管理股')])


def test_snapshot_filters_at_backend_and_date_precision(research):
    assert history.snapshot('one','2023-04-22')['facts'] == []
    result=history.snapshot('one','2023-04-23')
    assert [f['id'] for f in result['facts']]==['assertion-early']
    assert 'assertion-future' not in json.dumps(result)
    assert result['facts'][0]['value'] is None
    assert len(history.snapshot('one','2023-06-02')['facts'])==2


def test_revision_preserves_earlier_view(research):
    sessions,_=research
    with sessions.begin() as db: db.get(Document,'future').supersedes_id='early'
    assert len(history.snapshot('one','2023-04-23')['facts'])==1
    assert [x['id'] for x in history.snapshot('one','2023-06-02')['facts']]==['assertion-future']


def test_uncertain_historical_version_excluded(research):
    sessions,_=research
    with sessions.begin() as db: db.get(Document,'early').metadata_json='{"historical_availability_uncertain": true}'
    assert history.snapshot('one','2023-04-23')['facts']==[]


def test_uncertain_replacement_does_not_erase_confirmed_past(research):
    sessions,_=research
    with sessions.begin() as db:
        d=db.get(Document,'future');d.supersedes_id='early';d.metadata_json='{"historical_availability_uncertain": true}'
    assert [x['id'] for x in history.snapshot('one','2023-06-02')['facts']]==['assertion-early']


def test_fulltext_is_time_scoped_and_stays_candidate(research):
    sessions,_=research
    with sessions.begin() as db:
        for ident in ('early','future'):
            db.add(DocumentPage(document_id=ident,page=1,text='测试终止上市原文',extraction_method='test'))
    result=history.search_pages('终止上市','2023-04-23','one')
    assert len(result['items'])==1 and result['items'][0]['document_id']=='early'
    assert result['items'][0]['verification_status']=='candidate'
    assert history.search_pages('%_','2023-04-23')['items']==[]


def test_manual_original_stays_uncertain_and_is_idempotent(research, monkeypatch):
    from types import SimpleNamespace
    from app import data_pipeline as pipeline
    sessions,root=research
    monkeypatch.setattr(pipeline,'SessionLocal',sessions);monkeypatch.setattr(pipeline,'ROOT',root)
    metadata=root/'manual.json'
    metadata.write_text(json.dumps(dict(company_id='one',announcement_id='manual-test',title='Test',url='https://example.org/disclosure',published_at='2023-04-20',institution='Test',usage_note='test fixture')))
    args=SimpleNamespace(file=str(root/'data/raw/documents/early.pdf'),metadata=str(metadata))
    first=pipeline.import_pdf(args);second=pipeline.import_pdf(args)
    assert first['status']=='candidate' and second['status']=='already_imported'
    assert first['document_id']==second['document_id']
    assert all(d['id']!=first['document_id'] for d in history.snapshot('one','2023-04-23')['documents'])


def test_duplicate_claims_fail_before_demoting_existing_evidence(research,monkeypatch):
    from types import SimpleNamespace
    from app import data_pipeline as pipeline
    sessions,root=research
    monkeypatch.setattr(pipeline,'SessionLocal',sessions);monkeypatch.setattr(pipeline,'ROOT',root)
    path=root/'data/curated/assertions.json';path.parent.mkdir(parents=True)
    path.write_text('[{"id":"duplicate"},{"id":"duplicate"}]')
    with pytest.raises(ValueError,match='重复断言'): pipeline.validate(SimpleNamespace())
    with sessions() as db: assert db.get(Assertion,'assertion-early').status=='source_supported'


def test_additive_migration_backs_up_and_preserves_old_data(tmp_path):
    import sqlite3
    path=tmp_path/'old.sqlite3'
    with sqlite3.connect(path) as conn:
        conn.execute('CREATE TABLE existing_user_data (value TEXT)');conn.execute("INSERT INTO existing_user_data VALUES ('keep')")
    eng=create_engine('sqlite:///'+str(path))
    migrate(eng);migrate(eng)
    with sqlite3.connect(path) as conn: assert conn.execute('SELECT value FROM existing_user_data').fetchone()[0]=='keep'
    assert len(list((tmp_path/'backups').glob('*.sqlite3')))==1
    eng.dispose()


def test_incomplete_observation_is_not_negative(research):
    assert history.outcomes('one','2023-04-23')['observation_status']=='insufficient_coverage'
    assert history.outcomes('one',date.today().isoformat())['observation_status']=='right_censored'


def test_no_forced_match_and_same_input_reuses_id(research):
    a=history.compare_entities('one','2023-04-23')
    b=history.compare_entities('one','2023-04-23')
    assert a['matches']==[] and a['status']=='insufficient' and a['id']==b['id']


def test_local_pdf_hash_and_path_checks(research):
    sessions,root=research
    client=TestClient(app)
    assert client.get('/api/v2/sources/early/document').status_code==200
    (root/'data/raw/documents/early.pdf').write_bytes(b'corrupt')
    assert client.get('/api/v2/sources/early/document').status_code==409
    with sessions.begin() as db: db.get(Document,'early').local_file='../secret.pdf'
    assert client.get('/api/v2/sources/early/document').status_code==404


@pytest.mark.parametrize('url',['file:///etc/passwd','http://static.cninfo.com.cn/a.pdf','https://127.0.0.1/a','https://static.cninfo.com.cn.evil.example/a','https://user:pass@static.cninfo.com.cn/a'])
def test_download_rejects_unapproved_targets(url):
    with pytest.raises(ValueError): safe_url(url)


def scenario(**changes):
    value=json.loads((ROOT/'data/demo_scenarios.json').read_text(encoding='utf-8'));value.update(changes)
    return SimulationInput.model_validate(value)


def test_full_prepayment_zero_batch_and_ledger_reconciliation():
    a=simulate(scenario(prepayment_rate=1, shipments=[{'day':10,'fraction':1},{'day':730,'fraction':0}]))
    assert a['final_payment_day']==0 and not a['outside_view_payment']
    assert not any(x['kind']=='remainder' for x in a['cash_ledger'])
    b=simulate(scenario(order_amount_yuan='1.01',prepayment_rate='.33',direct_cost_yuan='.73',shipments=[{'day':1,'fraction':'.33'},{'day':2,'fraction':'.33'},{'day':3,'fraction':'.34'}]))
    assert sum(Decimal(str(x['amount_yuan'])) for x in b['cash_ledger'] if x['kind'] in ('prepayment', 'remainder'))==Decimal('1.01')
    assert sum(Decimal(str(x['amount_yuan'])) for x in b['cash_ledger'] if x['kind']=='direct_cost')==Decimal('-.73')


def test_fixed_cost_date_and_actual_comparison_inputs():
    inp=scenario(cost_day=2,cost_payment_rule='fixed_day',prepayment_rate='.5')
    result=simulate(inp)
    assert {x['day'] for x in result['cash_ledger'] if x['kind']=='direct_cost'}=={2}
    variants=compare(inp)['variants']
    assert variants[1]['inputs']['prepayment_rate']=='0.30'
    assert [s['day'] for s in variants[2]['inputs']['shipments']]==[10,45]
    assert '日内' in result['warnings'][0]


@pytest.mark.parametrize('value',['NaN','Infinity','0.001','1000000000000000'])
def test_invalid_precision_and_nonfinite_money(value):
    with pytest.raises(ValueError): scenario(order_amount_yuan=value)


def test_unsupported_llm_explanation_falls_back(monkeypatch):
    monkeypatch.setenv('LLM_PROVIDER','openai');monkeypatch.setenv('LLM_API_KEY','test');monkeypatch.setenv('LLM_MODEL','test')
    monkeypatch.setattr(llm,'_call',lambda _:json.dumps({'plain_language':'这家企业明天会破产并且违约。','question_to_verify':'请立刻拒绝订单。','caveat':'没有任何不确定性。'},ensure_ascii=False))
    result=llm.explain({'explanation':'公开资料仅提示条件风险，后续尚未复核。','affected_entity':'Zinitix'},'可能发生变化。')
    assert result['fallback'] and result['mode']=='offline'


@pytest.mark.parametrize('excerpt',['可能决定公司股票终止上市','未发生决定终止上市的事项','如触发条件将决定终止上市','已经偿付债务，尚未决定终止上市'])
def test_conditional_negative_and_repaid_are_not_outcomes(excerpt):
    from app.data_pipeline import check_event_claim
    with pytest.raises(ValueError):
        check_event_claim({'event_type':'delisting_decided','stage':'终止上市决定','is_outcome':True,'excerpt':excerpt})


def test_pdf_image_viewer_renders_original_page(research):
    client=TestClient(app)
    result=client.get('/api/v2/sources/early/pages/1')
    assert result.status_code==200 and result.content.startswith(b'\x89PNG')
    assert client.get('/api/v2/sources/early/pages/0').status_code==404
    assert '原文第 1 / 1 页' in client.get('/api/v2/sources/early/viewer?page=1').text


def test_offline_snapshot_original_and_trade_need_no_external_socket(research, monkeypatch):
    import socket
    import ipaddress
    original_connect = socket.socket.connect
    def blocked(sock, address):
        if isinstance(address, tuple) and ipaddress.ip_address(address[0]).is_loopback:
            return original_connect(sock, address)
        raise OSError('test disables all external sockets, allows local service')
    monkeypatch.setattr(socket.socket,'connect',blocked)
    client=TestClient(app)
    assert client.get('/api/v2/companies/one/snapshot?as_of=2023-04-23').status_code==200
    assert client.get('/api/v2/sources/early/pages/1').status_code==200
    assert simulate(scenario())['minimum_balance_yuan']==30000
    response=client.get('/api/v2/discovery?query=未知企业').json()
    assert response['status']=='failed' and response['verification_status']=='insufficient'


@pytest.mark.parametrize('mutation', ['unit', 'period', 'amount', 'subject', 'hash', 'joined_columns', 'metric', 'prior_column', 'extraction_cache'])
def test_financial_validation_demotes_changed_claim(research, monkeypatch, mutation):
    import shutil
    from types import SimpleNamespace
    from app import data_pipeline as pipeline
    sessions,root=research
    claim=next(x for x in json.loads((ROOT/'data/curated/assertions.json').read_text(encoding='utf-8')) if x['id']=='claim-1225532542-total_assets_yuan')
    # This original was already tracked in the legacy demo; no live DB or network required.
    row=dict(id='financial',announcement_id=claim['announcement_id'],company_id='one',title=claim['report_title'],url='https://static.cninfo.com.cn/test.PDF',
        published_at='2026-08-29',available_at='2026-08-30',fetched_at='2026-10-02',sha256=claim['expected_sha256'],local_file='data/raw/documents/financial.pdf',
        fetch_status='success',integrity_status='hash_recorded',extraction_status='text_available',verification_status='candidate',metadata_json='{}')
    target=root/row['local_file'];target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/'data/source_docs/report_summary_2026_H1.pdf',target)
    with sessions.begin() as db:
        row['company_id']='one';db.add(Document(**row))
    claims=root/'data/curated/assertions.json';claims.parent.mkdir(parents=True,exist_ok=True);claims.write_text(json.dumps([claim],ensure_ascii=False),encoding='utf-8')
    monkeypatch.setattr(pipeline,'SessionLocal',sessions);monkeypatch.setattr(pipeline,'ROOT',root)
    assert pipeline.validate(SimpleNamespace())['supported']==1
    if mutation=='unit': claim['raw_unit']='千元';claim['unit_context']='单位：千元'
    if mutation=='period': claim['period_end']='2025-06-30'
    if mutation=='amount': claim['value']='123.00'
    if mutation=='subject': claim['entity_name']='未在原文出现的公司'
    if mutation=='hash': claim['expected_sha256']='0'*64
    if mutation=='joined_columns':
        claim['raw_value']='2,448,077,798.221';claim['value']='2448077798.221';claim['excerpt']='总资产2,448,077,798.221'
    if mutation=='metric': claim['field']='revenue_yuan'
    if mutation=='prior_column': claim['table_locator']['column_label']='上年度末'
    if mutation=='extraction_cache':
        claim['excerpt']='不存在的表格999';claim['raw_value']='999';claim['value']='999'
        cache=root/'data/extracted/financial.json';cache.parent.mkdir(parents=True,exist_ok=True)
        cache.write_text(json.dumps({'pages':[{'text':claim['excerpt']}]},ensure_ascii=False),encoding='utf-8')
    claims.write_text(json.dumps([claim],ensure_ascii=False),encoding='utf-8')
    assert pipeline.validate(SimpleNamespace())['rejected']==1
    with sessions() as db: assert db.get(Assertion,claim['id']).status=='insufficient'
