import importlib
import json
import shutil
import pytest
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker
from app.db.models import Base, Fact, Source, ImportLog, Company, RiskEvent, ROOT

seed_module = importlib.import_module('app.db.seed')


@pytest.fixture
def workspace(tmp_path, monkeypatch):
    shutil.copytree(ROOT / 'data', tmp_path / 'data', ignore=shutil.ignore_patterns('*.sqlite3', 'raw', 'extracted', 'backups', 'manifests', 'exports', 'runtime', 'models'))
    engine = create_engine(f'sqlite:///{tmp_path / "test.sqlite3"}')
    @event.listens_for(engine, 'connect')
    def foreign_keys(conn, _):
        conn.execute('PRAGMA foreign_keys=ON')
    sessions = sessionmaker(bind=engine)
    monkeypatch.setattr(seed_module, 'ROOT', tmp_path)
    monkeypatch.setattr(seed_module, 'engine', engine)
    monkeypatch.setattr(seed_module, 'SessionLocal', sessions)
    yield tmp_path, sessions
    engine.dispose()


def edit(root, relative, change):
    file = root / 'data' / relative
    value = json.loads(file.read_text(encoding='utf-8'))
    change(value)
    file.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')


def test_repeat_and_legacy_additive_migration(workspace):
    root, sessions = workspace
    first = seed_module.seed()
    with sessions.begin() as db:
        db.execute(text('DROP INDEX ux_sources_sha256'))
    assert seed_module.seed() == first == dict(companies=1, sources=2, facts=4, risk_events=1, verified_sources=2)
    with sessions() as db:
        assert db.query(ImportLog).count() == 2
        assert db.execute(text("SELECT name FROM sqlite_master WHERE name='ux_sources_sha256'")).scalar()


def test_damaged_pdf_demotes_all_dependents(workspace):
    root, sessions = workspace
    seed_module.seed()
    (root / 'data/source_docs/subsidiary_risk_2026-09-03.pdf').write_bytes(b'corrupted')
    assert seed_module.seed()['verified_sources'] == 1
    with sessions() as db:
        assert not db.get(Source, 'src-risk-20260903').accessible
        assert db.get(Fact, 'fact-zinitix-status').verification_status == 'unverified'
        assert db.get(RiskEvent, 'event-zinitix-management').verification_status == 'unverified'


@pytest.mark.parametrize('kind', ['dangling', 'duplicate_id', 'duplicate_hash', 'amount', 'mismatched_value', 'entity', 'missing_period'])
def test_invalid_input_preserves_previous_snapshot(workspace, kind):
    root, sessions = workspace
    seed_module.seed()
    if kind == 'duplicate_hash':
        edit(root, 'source_manifest.json', lambda data: data[1].update(sha256=data[0]['sha256'].lower()))
    else:
        def mutate(data):
            if kind == 'dangling': data['facts'][0]['source_id'] = 'does-not-exist'
            if kind == 'duplicate_id': data['facts'][1]['id'] = data['facts'][0]['id']
            if kind == 'amount': data['facts'][0]['value_yuan'] = 'NaN'
            if kind == 'mismatched_value': data['facts'][0]['value_yuan'] = '100.00'
            if kind == 'entity': data['risk_events'][0]['affected_entity'] = '未核实主体'
            if kind == 'missing_period': del data['facts'][0]['period']
        edit(root, 'verified/halo-688173.json', mutate)
    with pytest.raises(ValueError): seed_module.seed()
    with sessions() as db:
        assert db.query(Fact).count() == 4
        assert db.get(Fact, 'fact-revenue').verification_status == 'verified'
        assert json.loads(db.query(ImportLog).order_by(ImportLog.id.desc()).first().summary)['status'] == 'failed'


def test_mid_transaction_failure_rolls_back(workspace, monkeypatch):
    root, sessions = workspace
    seed_module.seed()
    edit(root, 'verified/halo-688173.json', lambda data: data['company'].update(short_name='事务中途变更'))
    def fail(_): raise RuntimeError('injected after source writes')
    monkeypatch.setattr(seed_module, 'mark_conflicts', fail)
    with pytest.raises(RuntimeError): seed_module.seed()
    with sessions() as db:
        assert db.get(Company, 'halo-688173').short_name == '希荻微'
        assert db.query(Source).count() == 2


def test_unreviewed_support_cannot_verify_event(workspace):
    root, sessions = workspace
    edit(root, 'verified/halo-688173.json', lambda data: data['facts'][3].update(reviewed_by_human=False))
    seed_module.seed()
    with sessions() as db:
        assert db.get(Fact, 'fact-zinitix-status').verification_status == 'unverified'
        assert db.get(RiskEvent, 'event-zinitix-management').verification_status == 'unverified'


def test_scans_new_file_and_deduplicates_event(workspace):
    root, sessions = workspace
    # Test-only synthetic identity, never written to the project data or live DB.
    original = json.loads((root / 'data/verified/halo-688173.json').read_text(encoding='utf-8'))
    duplicate = dict(original['risk_events'][0], id='same-announcement-other-id')
    edit(root, 'verified/halo-688173.json', lambda data: data['risk_events'].append(duplicate))
    extra = {'company': dict(original['company'], id='test-only', ticker='TEST', legal_name='测试专用'), 'facts': [], 'risk_events': []}
    (root / 'data/verified/another.json').write_text(json.dumps(extra), encoding='utf-8')
    first = seed_module.seed()
    assert first['companies'] == 2 and first['risk_events'] == 1
    assert seed_module.seed() == first
