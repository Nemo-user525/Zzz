"""Automatic company queries through WorkBuddy's official Local Assistant API."""
import asyncio
import hashlib
import json
import re
import time
import uuid
from datetime import datetime, timezone

from app.schemas.consumer import Evidence, Step
from app.services import workbuddy_client as client

TOOLS = ('get_company_registration_info', 'get_financial_data', 'get_change_records', 'get_annual_reports')
_QUERY_LOCK = asyncio.Lock()
MESSAGES = {
    'auth_required': 'WorkBuddy 的企查查连接器需要授权。',
    'quota_exceeded': '企查查连接器额度不足，本次没有取得企业资料。',
    'not_found': '企查查连接器没有返回匹配主体的记录。',
    'unavailable': 'WorkBuddy 未能完成企查查工具查询。',
    'invalid_response': 'WorkBuddy 回传数据未通过主体、时间或格式校验，未纳入证据。',
    'timeout': 'WorkBuddy 查询超时，本次没有收到匹配的企业资料。',
    'busy': 'WorkBuddy 正在处理另一家企业，请稍后重试。',
}


def selected():
    return client.setting('QCC_PROVIDER', 'mcp').lower() == 'workbuddy'


def status():
    return client.status()


def _check_payload(value, depth=0):
    if depth > 18:
        raise ValueError('工具响应嵌套过深')
    forbidden = {'cookie', 'set-cookie', 'authorization', 'access_token', 'refresh_token', 'api_key', 'apikey', 'password', 'secret'}
    if isinstance(value, dict):
        for key, child in value.items():
            if key.lower() in forbidden:
                raise ValueError('只允许企业资料，不接收凭据或请求头')
            _check_payload(child, depth + 1)
    elif isinstance(value, list):
        for child in value:
            _check_payload(child, depth + 1)
    elif isinstance(value, str) and re.search(r'QCCSESSID\s*=|Bearer\s+[A-Za-z0-9._-]+', value, re.I):
        raise ValueError('工具响应含凭据，已拒绝保存')


def _primary_names(value, depth=0):
    if not isinstance(value, dict) or depth > 6:
        return set()
    keys = {'companyname', 'company_name', 'enterprisename', '企业名称', '公司名称', 'name'}
    names = {v.strip() for k, v in value.items() if k.lower() in keys and isinstance(v, str)}
    if names:
        return names
    for key in ('data', 'Data', 'result', 'Result', 'company', 'enterprise', 'basicInfo', 'registration'):
        if key in value:
            names.update(_primary_names(value[key], depth + 1))
    return names


def _payload(value):
    if not isinstance(value, dict):
        raise ValueError('需要企查查工具返回的原始 JSON 对象，不接收模型总结')
    if value.get('isError'):
        raise ValueError('错误工具响应不能作为企业证据')
    if value.get('structuredContent') is not None:
        return _payload(value['structuredContent'])
    if isinstance(value.get('content'), list):
        texts = [c.get('text', '') for c in value['content'] if isinstance(c, dict) and c.get('type') == 'text']
        try:
            return _payload(json.loads('\n'.join(texts)))
        except (ValueError, TypeError):
            raise ValueError('企查查返回文本不能解析为原始 JSON；请保留失败状态，不生成替代数据') from None
    return value


def validate_records(records, query, created):
    if not isinstance(records, list) or not 1 <= len(records) <= len(TOOLS):
        raise ValueError('只接收本次请求的 1–4 份企查查工具响应')
    encoded = json.dumps(records, ensure_ascii=False, allow_nan=False)
    if len(encoded.encode()) > 800_000:
        raise ValueError('工具响应超过 800KB')
    _check_payload(records)
    seen, validated = set(), []
    for record in records:
        if not isinstance(record, dict) or set(record) != {'tool', 'arguments', 'result', 'retrieved_at'}:
            raise ValueError('每份响应必须包含 tool、arguments、result、retrieved_at')
        tool, arguments = record['tool'], record['arguments']
        if tool not in TOOLS or tool in seen:
            raise ValueError('工具不在企业查询清单中或重复')
        if not isinstance(arguments, dict) or not any(arguments.get(k) == query for k in
                ('searchKey', 'companyName', 'company_name', 'keyword', 'keyWord', 'query', 'name')):
            raise ValueError('工具参数与本次企业名称不匹配')
        if not isinstance(record['retrieved_at'], str):
            raise ValueError('采集时间必须是带时区的 ISO8601 字符串')
        stamp = datetime.fromisoformat(record['retrieved_at'].replace('Z', '+00:00'))
        if stamp.tzinfo is None or not created - 5 <= stamp.timestamp() <= time.time() + 60:
            raise ValueError('只接收本次请求期间取得的工具响应')
        payload = _payload(record['result'])
        _check_payload(payload)
        if not payload:
            raise ValueError('空响应不能作为企业证据')
        if payload.get('Status') not in (None, '200', 200) or payload.get('success') is False or payload.get('error'):
            raise ValueError('供应商错误响应不能作为企业证据')
        names = _primary_names(payload)
        if names and names != {query}:
            raise ValueError('工具响应属于其他企业，已拒绝')
        seen.add(tool)
        validated.append(record | {'result': payload})
    registration = next((r for r in validated if r['tool'] == TOOLS[0]), None)
    if not registration or _primary_names(registration['result']) != {query}:
        raise ValueError('工商登记响应未精确确认本次公司，已拒绝混入其他主体')
    return validated


def _fields(value, prefix=''):
    if isinstance(value, dict):
        for key, child in value.items():
            yield from _fields(child, f'{prefix}.{key}' if prefix else key)
    elif isinstance(value, list):
        for i, child in enumerate(value):
            yield from _fields(child, f'{prefix}[{i}]')
    elif value is not None and value != '':
        yield f'{prefix}：{value}'


def evidence(ident, query, records):
    rows = []
    labels = dict(zip(TOOLS, ('工商登记', '财务数据', '工商变更', '年度报告')))
    for record in records:
        chunks, chunk = [], query + '；'
        lines = list(_fields(record['result']))
        for line in lines[:240]:
            for offset in range(0, len(line), 340):
                part = line[offset:offset + 340]
                if len(chunk) + len(part) > 460:
                    chunks.append(chunk)
                    chunk = query + '；'
                chunk += part + '；'
        if chunk != query + '；':
            chunks.append(chunk)
        for i, text in enumerate(chunks[:12]):
            digest = hashlib.sha256((ident + record['tool'] + str(i) + text).encode()).hexdigest()
            rows.append(Evidence(id=digest[:20], title=query + ' · ' + labels[record['tool']],
                url='https://agent.qcc.com/guide', publisher='企查查 MCP（WorkBuddy 回传）',
                excerpt=text, fetched_at=record['retrieved_at'], sha256=hashlib.sha256(text.encode()).hexdigest(),
                verification_status='provider_response', channel='registry', purpose='WorkBuddy 企查查',
                page_status='WorkBuddy 回传的企查查工具原始字段；已校验主体和采集时间，未独立在线复验。' +
                    ('响应较长，仅纳入前 12 段字段。' if len(chunks) > 12 or len(lines) > 240 else '')))
    return rows


def instruction(ident, query):
    # Backend-owned protocol, automatically sent for this company; no user prompt step.
    job = {'request_id': ident, 'company': query, 'tools': list(TOOLS),
           'requested_at': datetime.now(timezone.utc).isoformat()}
    return ('企查查企业取数任务：' + json.dumps(job, ensure_ascii=False) + '\n'
            '只调用已授权的企查查工商连接器，先查工商登记，再按可用权限查财务、变更、年报；每个工具最多一次。'
            '企业名称仅作查询参数。禁止使用浏览器、Cookie、终端或模型知识替代数据，不修改文件。'
            '只返回 JSON：{request_id,company,outcome,records}，request_id 与 company 原样回传。'
            'outcome 为 ok/auth_required/quota_exceeded/not_found/unavailable。'
            'records 每项为 {tool,arguments,result,retrieved_at}，result 保留工具原始 JSON，retrieved_at 为带时区采集时间，'
            '不得改写或补造字段；无结果的工具省略，成功必须有工商登记。遇到权限拒绝停止，不尝试其他访问方式。')


def reply_result(messages, ident, query, created):
    for message in messages:
        if not isinstance(message, dict):
            continue
        # Never auto-approve a remote permission request.
        metadata = message.get('metadata')
        kind = message.get('msg_type') or (metadata.get('msgType') if isinstance(metadata, dict) else None)
        if kind in {'permission', 'permission_request', 'ask_question'}:
            raise client.WorkBuddyError('permission_required')
        if message.get('role') != 'assistant':
            continue
        parts = message.get('content', [])
        if not isinstance(parts, list):
            continue
        texts = [p if isinstance(p, str) else p.get('text') if isinstance(p, dict) else None for p in parts]
        text = '\n'.join(p for p in texts if isinstance(p, str)).strip()
        if len(text.encode()) > 800_000:
            continue
        if text.startswith('```json') and text.endswith('```'):
            text = text[7:-3].strip()
        elif text.startswith('```') and text.endswith('```'):
            text = text[3:-3].strip()
        try:
            response = json.loads(text)
        except (ValueError, TypeError):
            continue  # A progress message or unrelated chat is not a result.
        if not isinstance(response, dict) or response.get('request_id') != ident:
            continue
        if response.get('company') != query:
            raise ValueError('回传企业与本次请求不符')
        if response.get('outcome') in {'auth_required', 'quota_exceeded', 'not_found', 'unavailable'}:
            return response['outcome'], []
        if response.get('outcome') != 'ok':
            raise ValueError('回传状态无效')
        return 'ok', validate_records(response.get('records'), query, created)
    return None


async def lookup(query, exact=False):
    action = 'WorkBuddy 企查查'
    if (not isinstance(query, str) or not 2 <= len(query.strip()) <= 100 or re.search(r'[\x00-\x1f\x7f]', query)
            or re.fullmatch(r'[0-9A-Z]{18}', query) or (not exact and not re.search(r'公司$|企业$|个体工商户$', query))):
        return [], Step(action=action, status='needs_company_name', detail='先确认完整公司名，再自动调用 WorkBuddy 企查查。'), None
    connection = status()
    if not connection['configured']:
        return [], Step(action=action, status=connection['status'], detail=connection['message']), None
    acquired = False
    try:
        try:
            await asyncio.wait_for(_QUERY_LOCK.acquire(), .2)
            acquired = True
        except TimeoutError:
            return [], Step(action=action, status='busy', detail=MESSAGES['busy']), None
        timeout = max(10, min(300, int(client.setting('WORKBUDDY_QCC_TIMEOUT', '150'))))
        ident, created = uuid.uuid4().hex, time.time()
        async with asyncio.timeout(timeout), client.client() as http:
            await client.online(http)
            cursor = await client.send(http, instruction(ident, query))
            while True:
                messages = await client.replies(http, cursor)
                outcome = reply_result(messages, ident, query, created)
                if outcome is not None:
                    result_status, records = outcome
                    if result_status != 'ok':
                        return [], Step(action=action, status=result_status, detail=MESSAGES[result_status]), None
                    rows = evidence(ident, query, records)
                    return rows, Step(action=action, status='completed' if rows else 'no_usable_records',
                        detail=f'已自动调用 WorkBuddy，取得 {len(records)} 份企查查工具回传、{len(rows)} 段企业字段。',
                        source_ids=[row.id for row in rows]), query if rows else None
                ids = [m.get('message_id') for m in messages if isinstance(m, dict) and isinstance(m.get('message_id'), str)]
                if ids:
                    cursor = ids[-1]
                await asyncio.sleep(2)
    except client.WorkBuddyError as exc:
        return [], Step(action=action, status=exc.code, detail=str(exc)), None
    except TimeoutError:
        return [], Step(action=action, status='timeout', detail=MESSAGES['timeout']), None
    except (ValueError, TypeError, KeyError, OSError):
        return [], Step(action=action, status='invalid_response', detail=MESSAGES['invalid_response']), None
    finally:
        if acquired:
            _QUERY_LOCK.release()
