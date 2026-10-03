"""Validate curator-owned files before making any database changes."""
from datetime import date
from decimal import Decimal, InvalidOperation
import json
import re
from .models import Company, Fact, RiskEvent, Source
from app.schemas.api import SimulationInput


def fail(where, message):
    raise ValueError(f"{where}: {message}")


def read_json(path):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError) as exc:
        fail(str(path), str(exc))


def required(row, model, where, excluded=()):
    if not isinstance(row, dict):
        fail(where, "必须为对象")
    for col in model.__table__.columns:
        if col.name in excluded:
            continue
        if col.name not in row:
            fail(where, f"缺失字段 {col.name}（未知值需显式 null）")
        if col.nullable:
            continue
        value = row.get(col.name)
        if value is None or isinstance(value, str) and not value.strip():
            fail(where, f"缺失非空字段 {col.name}")


def amount(value, where):
    if value is None:
        return
    try:
        n = Decimal(str(value))
        if not n.is_finite() or abs(n) >= Decimal('1e18') or n != n.quantize(Decimal('.01')):
            fail(where, "金额必须为有限的人民币元，最多两位小数且少于 18 位整数")
    except InvalidOperation:
        fail(where, "非法金额")


def load_inputs(root):
    manifest = read_json(root / 'data/source_manifest.json')
    if not isinstance(manifest, list):
        fail('source_manifest.json', '必须为来源数组')
    records = []
    seen = {key: set() for key in ('source', 'url', 'sha256', 'company', 'fact', 'event')}
    def unique(kind, value, where):
        if value in seen[kind]:
            fail(where, f"重复 {kind}: {value}")
        seen[kind].add(value)
    for index, src in enumerate(manifest):
        if not isinstance(src, dict):
            fail(f'source_manifest.json[{index}]', '必须为来源对象')
        where = f"source_manifest.json[{index}] ({src.get('id')})"
        required(src, Source, where, ('accessible',))
        for key in ('url', 'sha256'):
            unique(key, src[key].lower() if key == 'sha256' else src[key], where)
        unique('source', src['id'], where)
        if not re.fullmatch(r'[0-9a-fA-F]{64}', src['sha256']):
            fail(where, 'SHA-256 格式错误')
        if not src['url'].startswith('https://'):
            fail(where, '官方来源需使用 HTTPS URL')
        for key in ('published_at', 'fetched_at'):
            try:
                date.fromisoformat(src[key])
            except (ValueError, TypeError):
                fail(where, f'{key} 必须为 ISO 日期')
        path = (root / src['local_file']).resolve()
        if not path.is_relative_to((root / 'data/source_docs').resolve()):
            fail(where, 'PDF 路径必须位于 data/source_docs')
        if type(src['page']) is not int or src['page'] < 1:
            fail(where, '引用页必须为正整数')
    for path in sorted((root / 'data/verified').glob('*.json')):
        record = read_json(path)
        where = path.name
        if not isinstance(record, dict):
            fail(where, '必须为核验记录对象')
        required(record.get('company'), Company, where)
        company = record['company']['id']
        unique('company', company, where)
        for fact in record.get('facts', []):
            if not isinstance(fact, dict):
                fail(f'{where}/facts', '必须为事实对象')
            loc = f"{where}/facts/{fact.get('id')}"
            required(fact, Fact, loc, ('company_id',))
            unique('fact', fact['id'], loc)
            if fact.get('company_id', company) != company:
                fail(loc, 'company_id 与文件企业不一致')
            if fact['source_id'] not in seen['source']:
                fail(loc, f"悬空 source_id {fact['source_id']}")
            if fact['unit'] != 'CNY':
                fail(loc, 'unit 必须为 CNY（元）')
            if type(fact['page']) is not int or fact['page'] < 1:
                fail(loc, '引用页必须为正整数')
            if type(fact['reviewed_by_human']) is not bool or type(fact['audited']) is not bool:
                fail(loc, '人工复核与审计标记必须为布尔值')
            for part in fact['period'].split('/'):
                try:
                    date.fromisoformat(part)
                except (ValueError, TypeError):
                    fail(loc, '报告期必须为 ISO 日期或起止日期')
            amount(fact['value_yuan'], loc)
            if fact['value_yuan'] is not None:
                quoted = {Decimal(n.replace(',', '')) for n in re.findall(r'-?\d[\d,]*(?:\.\d+)?', fact['excerpt'])}
                if Decimal(str(fact['value_yuan'])) not in quoted:
                    fail(loc, '金额与原文短摘录中的数字不一致')
        for event in record.get('risk_events', []):
            if not isinstance(event, dict):
                fail(f'{where}/risk_events', '必须为事件对象')
            loc = f"{where}/risk_events/{event.get('id')}"
            required(event, RiskEvent, loc, ('source_ids_json',))
            unique('event', event['id'], loc)
            if event['company_id'] != company:
                fail(loc, '事件 company_id 与文件企业不一致')
            try:
                date.fromisoformat(event['event_date'])
            except (ValueError, TypeError):
                fail(loc, '事件日期必须为 ISO 日期')
            ids = event.get('source_ids')
            if not ids or any(s not in seen['source'] for s in ids):
                fail(loc, '事件来源为空或存在悬空引用')
            amount(event['amount_yuan'], loc)
            # Entity identity must occur in curator-reviewed supporting facts.
            token = re.split(r'[（(\s]', event['affected_entity'])[0].casefold()
            support = ' '.join(f['excerpt'] + ' ' + f['scope'] for f in record.get('facts', []) if f['source_id'] in ids).casefold()
            if not token or token not in support:
                fail(loc, '事件主体未出现在本企业的支持事实中，需负责人核对')
        records.append(record)
    if not records:
        fail('data/verified', '没有核验文件')
    scenario = read_json(root / 'data/demo_scenarios.json')
    SimulationInput.model_validate(scenario)
    if scenario['company_id'] not in seen['company']:
        fail('demo_scenarios.json', '悬空 company_id')
    return manifest, records, scenario
