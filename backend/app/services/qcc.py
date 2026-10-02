"""QCC API 736 adapter. Credentials and vendor errors never leave the backend."""
import hashlib
import os
import time
from datetime import datetime, timezone

import httpx
from fastapi import HTTPException

URL = 'https://api.qichacha.com/ECIInfoOverview/GetInfo'
DOCS = 'https://openapi.qcc.com/dataApi/736'

# Keep vendor fields explicit, including units embedded in their values.
GROUPS = [
    ('Penalty', '行政处罚', [('PenaltyDate','处罚日期'),('DocNo','决定文书号'),('OfficeName','处罚机关'),('PenaltyType','处罚事由'),('Content','处罚结果')]),
    ('Exceptions', '经营异常', [('AddDate','列入日期'),('AddReason','列入原因'),('RemoveDate','移出日期'),('RomoveReason','移出原因')]),
    ('ShiXinItems', '失信记录', [('Name','主体'),('Liandate','立案日期'),('Executegov','执行法院'),('Executeno','执行依据文号'),('Executestatus','履行情况'),('Actionremark','行为说明')]),
    ('ZhiXingItems', '被执行记录', [('Name','主体'),('Liandate','立案日期'),('Anno','案号'),('ExecuteGov','执行法院'),('Biaodi','执行标的（接口原值）'),('Status','状态')]),
    ('CompanyTaxCreditItems', '纳税信用', [('Name','纳税人'),('Year','评价年度'),('Level','信用等级')]),
    ('MPledge', '动产抵押', [('RegisterNo','登记编号'),('RegisterDate','登记日期'),('RegisterOffice','登记机关'),('DebtSecuredAmount','被担保债权数额（接口原值）'),('Status','状态')]),
    ('Pledge', '股权出质', [('RegistNo','登记编号'),('Pledgor','出质人'),('Pledgee','质权人'),('PledgedAmount','出质股权数额（接口原值）'),('RegDate','登记日期'),('Status','状态')]),
    ('Partners', '工商登记股东', [('StockName','股东'),('StockPercent','持股比例'),('ShouldCapi','认缴出资额（接口原值）')]),
    ('ChangeRecords', '工商变更', [('ProjectName','变更事项'),('ChangeDate','变更日期'),('BeforeContent','变更前'),('AfterContent','变更后')]),
]


def credentials():
    return os.getenv('QCC_APP_KEY', '').strip(), os.getenv('QCC_SECRET_KEY', '').strip()


def fail(code, message, status=502):
    raise HTTPException(status, detail={'code': code, 'message': message, 'details': []})


def text(value):
    return str(value) if isinstance(value, (str, int, float)) and not isinstance(value, bool) else None


def normalize(result, query):
    if not isinstance(result, dict) or not text(result.get('Name')):
        fail('qcc_invalid_response', '企查查未返回有效的企业身份，请核对完整企业名称或统一社会信用代码。')
    groups = []
    for key, label, fields in GROUPS:
        raw = result.get(key)
        available = isinstance(raw, list)
        rows = []
        for item in (raw[:100] if available else []):
            if not isinstance(item, dict):
                continue
            values = [{'label': title, 'value': text(item.get(field))} for field, title in fields if text(item.get(field)) is not None]
            if values:
                rows.append(values)
        groups.append({'id': key, 'title': label, 'available': available, 'returned_count': len(raw) if available else None, 'records': rows})
    return {
        'provider': '企查查', 'api_code': '736', 'query': query,
        'retrieved_at': datetime.now(timezone.utc).isoformat(),
        'company': {out: text(result.get(key)) for out, key in [
            ('name','Name'),('credit_code','CreditCode'),('registration_status','Status'),
            ('legal_representative','OperName'),('registered_capital','RegistCapi'),
            ('established_at','StartDate'),('updated_at','UpdatedDate'),('address','Address'),
            ('enterprise_type','EconKind'),('business_scope','Scope'),('paid_in_capital','RecCap'),
            ('approval_date','CheckDate'),('stock_number','StockNumber')]},
        'groups': groups,
        'limitations': [
            '以下为企查查本次接口返回，尚未逐条核对原始公示；不属于历史时点证据。',
            '部分字段最多返回前 100 条，条数不是完整风险总数；空记录或字段缺失不代表无风险。',
            '现金支出计划、客户收入集中度及关键员工依赖仍需企业补充。',
        ],
    }


async def lookup(query):
    key, secret = credentials()
    if not key or not secret:
        fail('qcc_not_configured', '企业联网查询尚未启用：请由网站管理员配置企查查密钥及接口 736 权限。', 503)
    stamp = str(int(time.time()))
    token = hashlib.md5((key + stamp + secret).encode('utf-8')).hexdigest().upper()
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
            response = await client.get(URL, params={'key': key, 'searchKey': query}, headers={'Token': token, 'Timespan': stamp})
            response.raise_for_status()
            payload = response.json()
    except httpx.TimeoutException:
        fail('qcc_timeout', '企查查查询超时，请稍后手动重试。', 504)
    except (httpx.HTTPError, ValueError):
        # Do not expose request URLs (which contain the app key) or vendor messages.
        fail('qcc_unavailable', '企查查暂时无法访问，请稍后手动重试。')
    if not isinstance(payload, dict):
        fail('qcc_invalid_response', '企查查返回格式异常，未生成企业结果。')
    if str(payload.get('Status')) != '200':
        fail('qcc_rejected', '企查查未完成查询。请核对企业全称或信用代码，并检查接口权限、密钥及剩余额度。')
    if payload.get('Result') in (None, {}, []):
        fail('qcc_not_found', '本次查询没有返回企业，请使用完整企业名称或统一社会信用代码。', 404)
    return normalize(payload['Result'], query)
