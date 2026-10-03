"""Bounded adapter for Eastmoney's public financial-analysis website data.

This is a website adapter, not a contracted API. Never ingest its rows as
verified historical evidence or infer a company from an ambiguous name.
"""
import asyncio
import math
import re
import time
from datetime import date, datetime, timezone

import httpx

URL = 'https://datacenter.eastmoney.com/securities/api/data/v1/get'
CODE = re.compile(r'^(?:[03][0-9]{5}\.SZ|6[0-9]{5}\.SH|(?:[48][0-9]{5}|92[0-9]{4})\.BJ)$')
REPORTS = [
    ('balance', '资产负债表', 'RPT_F10_FINANCE_GBALANCE', [
        ('MONETARYFUNDS', '货币资金'), ('TOTAL_ASSETS', '总资产'),
        ('TOTAL_LIABILITIES', '总负债'), ('ACCOUNTS_RECE', '应收账款'),
        ('INVENTORY', '存货'), ('SHORT_LOAN', '短期借款'),
        ('TOTAL_CURRENT_ASSETS', '流动资产'), ('TOTAL_CURRENT_LIAB', '流动负债')]),
    ('income', '利润表', 'RPT_F10_FINANCE_GINCOME', [
        ('OPERATE_INCOME', '营业收入'), ('TOTAL_OPERATE_INCOME', '营业总收入'),
        ('NETPROFIT', '净利润'), ('PARENT_NETPROFIT', '归母净利润'),
        ('RESEARCH_EXPENSE', '研发费用')]),
    ('cashflow', '现金流量表', 'RPT_F10_FINANCE_GCASHFLOW', [
        ('NETCASH_OPERATE', '经营活动现金流净额'), ('SALES_SERVICES', '销售商品、提供劳务收到的现金'),
        ('PAY_STAFF_CASH', '支付给职工以及为职工支付的现金'),
        ('NETCASH_INVEST', '投资活动现金流净额'), ('NETCASH_FINANCE', '筹资活动现金流净额'),
        ('END_CCE', '期末现金及现金等价物')]),
]
_cache = {}


def numeric(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return value if math.isfinite(value) else None


def string(value):
    return value[:120] if isinstance(value, str) else None


def date_field(value):
    if not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value[:10]).isoformat()
    except ValueError:
        return None


def normalize(payload, code, spec):
    group_id, title, report, fields = spec
    group = {'id': group_id, 'title': title, 'status': 'failed', 'records': [], 'message': ''}
    if not isinstance(payload, dict) or payload.get('success') is not True:
        return {**group, 'message': '来源未完成查询，请稍后重试或打开来源页面。'}
    result = payload.get('result')
    if not isinstance(result, dict) or not isinstance(result.get('data'), list):
        return {**group, 'message': '来源返回结构变化，已停止解析。'}
    rows = result['data']
    if not rows:
        return {**group, 'status': 'empty', 'message': '本次未返回该表，不代表企业没有相关资产或经营活动。'}
    for row in rows[:4]:
        if not isinstance(row, dict) or row.get('SECUCODE') != code or not date_field(row.get('REPORT_DATE')):
            return {**group, 'records': [], 'message': '证券代码或报告期无法核对，已拒绝混入其他企业数据。'}
        metrics = [{'id': field, 'label': label, 'value': numeric(row.get(field)), 'unit': 'amount'} for field, label in fields]
        if group_id == 'balance':
            assets, liabilities = numeric(row.get('TOTAL_ASSETS')), numeric(row.get('TOTAL_LIABILITIES'))
            ratio = round(liabilities / assets * 100, 2) if assets is not None and assets > 0 and liabilities is not None and liabilities >= 0 else None
            metrics.append({'id': 'debt_ratio', 'label': '资产负债率（同表计算）', 'value': ratio, 'unit': 'percent'})
        group['records'].append({
            'company_name': string(row.get('SECURITY_NAME_ABBR')), 'report_date': date_field(row.get('REPORT_DATE')),
            'report_name': string(row.get('REPORT_DATE_NAME')), 'published_at': date_field(row.get('NOTICE_DATE')),
            'updated_at': date_field(row.get('UPDATE_DATE')), 'currency': string(row.get('CURRENCY')),
            'metrics': metrics,
        })
    group['status'] = 'success'
    return group


async def lookup(code):
    if not CODE.fullmatch(code):
        raise ValueError('请使用已确认的 A 股证券代码及交易所后缀。')
    cached = _cache.get(code)
    if cached and time.monotonic() - cached[0] < 300:
        return {**cached[1], 'cached': True}
    async with httpx.AsyncClient(timeout=12, trust_env=False, follow_redirects=False,
                                 headers={'Referer': 'https://emweb.eastmoney.com/', 'User-Agent': 'XRayResearch/2.0'}) as client:
        async def fetch(spec):
            try:
                reply = await client.get(URL, params={
                    'reportName': spec[2], 'columns': 'ALL', 'filter': f'(SECUCODE="{code}")',
                    'pageSize': 4, 'pageNumber': 1, 'sortColumns': 'REPORT_DATE', 'sortTypes': -1,
                    'source': 'HSF10', 'client': 'PC',
                })
                reply.raise_for_status()
                if len(reply.content) > 2 * 1024 * 1024:
                    raise ValueError('oversized')
                return normalize(reply.json(), code, spec)
            except (httpx.HTTPError, ValueError):
                return {'id': spec[0], 'title': spec[1], 'status': 'failed', 'records': [],
                        'message': '来源访问失败或超时；其余来源仍可独立查看。'}
        groups = await asyncio.gather(*(fetch(spec) for spec in REPORTS))
    successes = sum(g['status'] == 'success' for g in groups)
    status = 'success' if successes == len(groups) else 'partial' if successes else 'failed' if any(g['status'] == 'failed' for g in groups) else 'empty'
    data = {
        'provider': '东方财富', 'status': status, 'security_code': code,
        'retrieved_at': datetime.now(timezone.utc).isoformat(), 'cached': False,
        'source_url': f'https://emweb.eastmoney.com/PC_HSF10/NewFinanceAnalysis/Index?code={code[-2:]}{code[:6]}&type=web',
        'groups': groups,
        'limitations': [
            '公开网页数据适配，每张表最多展示最近 4 个报告期；来源结构可能变化，并非商业 API 的可用性承诺。',
            '合并报表口径；资产负债表为期末余额，利润和现金流为年初至报告期末累计值，不能直接当作单季度值。',
            '每张表保留各自报告期、公开日及币种；缺失字段显示未提供，不跨报告期拼接。请以企业原始公告为准。',
            '货币资金可能含受限资金，不能直接视为可自由使用现金；缺少未来刚性支出计划，不能计算 3–6 个月覆盖能力。',
            '数据不进入历史事实库或自动替换订单推演输入；非上市企业及部分退市企业可能无此公开财报覆盖。',
        ],
    }
    # Partial and failed responses are not cached, so a manual retry can recover.
    if status == 'success':
        if len(_cache) >= 128:
            _cache.pop(next(iter(_cache)))
        _cache[code] = (time.monotonic(), data)
    return data
