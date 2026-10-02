"""Authorized QCC Streamable HTTP MCP. No credential harvesting or auth bypass."""
import asyncio
import hashlib
import json
import os
import re
import httpx
from pathlib import Path
from datetime import timedelta
from urllib.parse import urlparse
from app.schemas.consumer import Evidence, Step
from app.services.consumer_search import now

DOCS = 'https://agent.qcc.com/guide'
BUNDLED_CONFIG = Path(__file__).resolve().parents[3] / 'configs/qcc-mcp.json'
DEFAULT_URL = 'https://agent.qcc.com/mcp/company/stream'
DEFAULT_TOOLS = {'get_company_registration_info':'auto', 'get_financial_data':'auto',
                 'get_change_records':'auto', 'get_annual_reports':'auto'}
LAST = {}


def selected():
    from app.services.workbuddy_client import setting
    return setting('QCC_PROVIDER', 'mcp').lower() not in {'direct','workbuddy'}


def credentials():
    try:
        saved = json.loads(BUNDLED_CONFIG.read_text(encoding='utf-8'))
        if not isinstance(saved, dict): saved = {}
    except (OSError, ValueError):
        saved = {}
    key = os.getenv('QCC_MCP_API_KEY', '').strip() or saved.get('api_key', '')
    url = os.getenv('QCC_MCP_URL', '').strip() or saved.get('url', DEFAULT_URL)
    if not isinstance(key, str) or not isinstance(url, str): return '', ''
    key = re.sub(r'^Bearer\s+', '', key.strip(), flags=re.I)
    if not re.fullmatch(r'[A-Za-z0-9._~+/-]{1,4096}=*', key): return '', ''
    return url, key


def configured():
    return all(credentials())


def status():
    ready = configured()
    return {'provider':'qcc_mcp', 'configured':ready, 'configurable':False,
            'status':LAST.get('status', 'ready') if ready else 'not_configured',
            'message':LAST.get('detail', '已配置企查查官方 MCP；查询时直接调用，实际数据以本次响应为准。') if ready else '请在服务端配置企查查 MCP API Key。',
            'checked_at':LAST.get('checked_at')}


def primary_names(data):
    if not isinstance(data, dict): return set()
    names = {v.strip() for k,v in data.items() if k.lower() in
             {'name','companyname','company_name','enterprisename','企业名称','公司名称'} and isinstance(v,str)}
    if names: return names
    for key in ('data','Data','result','Result','company','enterprise','registration'):
        if isinstance(data.get(key),dict):
            names.update(primary_names(data[key]))
    return names


def fields(data, prefix=''):
    if isinstance(data, dict):
        for key, value in data.items():
            yield from fields(value, f'{prefix}.{key}' if prefix else key)
    elif isinstance(data, list):
        for i, value in enumerate(data):
            yield from fields(value, f'{prefix}[{i}]')
    elif data is not None and data != '':
        yield f'{prefix}：{data}'


def to_evidence(tool, data, name, fetched):
    # A provider's no-record message is a query status, not corporate evidence.
    if not isinstance(data, dict) or data.get('isError') or data.get('error') or data.get('success') is False:
        return []
    if data.get('Status') not in (None, '200', 200): return []
    payload = {k:v for k,v in data.items() if k not in {'企业名称','公司名称','name','companyName','搜索结果','提示','摘要'}}
    if not any(v not in (None, '', [], {}) for v in payload.values()): return []
    labels = {'get_company_registration_info':'工商登记','get_financial_data':'财务数据',
              'get_change_records':'工商变更','get_annual_reports':'企业年报'}
    cap = {'get_company_registration_info':3, 'get_change_records':6, 'get_annual_reports':6}.get(tool,4)
    # Keep each dated record together before cutting long fields; limits remain explicit.
    records = data.get('变更记录信息') if tool == 'get_change_records' else data.get('企业年报信息') if tool == 'get_annual_reports' else None
    items = records if isinstance(records,list) else [data]
    chunks = []
    truncated = False
    for item_index, item in enumerate(items):
        context = '；'.join(f'{k}：{item[k]}' for k in ('变更日期','变更项目','年报年度','发布日期') if isinstance(item,dict) and item.get(k))
        prefix = name + ('；'+context if context else '') + '；'
        chunk = prefix
        # Put financial disclosure status before lengthy business scope and shareholder lists.
        if isinstance(item,dict) and '企业资产状况信息' in item:
            item = {'企业资产状况信息':item['企业资产状况信息'], **item}
        lines = list(fields(item))
        for line in lines:
            for offset in range(0,len(line),240):
                part = line[offset:offset+240]
                if len(chunk)+len(part)>460:
                    chunks.append(chunk)
                    chunk = prefix
                chunk += part+'；'
        if chunk != prefix: chunks.append(chunk)
        # One long record must not consume the entire changes/reports budget.
        if records is not None and len(chunks)>2*(item_index+1):
            chunks = chunks[:2*(item_index+1)]
            truncated = True
        if len(chunks)>=cap:
            truncated = truncated or item_index+1<len(items) or len(chunks)>cap
            break
    truncated = truncated or len(chunks)>cap
    rows = []
    for i, excerpt in enumerate(chunks[:cap]):
        digest = hashlib.sha256((tool+name+str(i)+excerpt).encode()).hexdigest()
        rows.append(Evidence(id=digest[:20],title=name+' · '+labels.get(tool,tool),url=DOCS,
            publisher='企查查官方 MCP',excerpt=excerpt,fetched_at=fetched,sha256=hashlib.sha256(excerpt.encode()).hexdigest(),
            verification_status='provider_response',channel='registry',purpose='企查查 MCP',
            page_status='本次授权 MCP 直接返回字段；链接为官方接入说明，未复核原始公示。'+
                        ('响应较长，仅纳入部分字段和记录，不能代表完整历史。' if truncated else '')))
    return rows


def company_names(data):
    names = set()
    if isinstance(data, dict):
        for key, value in data.items():
            if key.lower() in {'name', 'companyname', 'company_name', 'enterprisename', '企业名称', '公司名称'} and isinstance(value, str):
                if (key.lower() != 'name' and 2 <= len(value.strip()) <= 100) or any(suffix in value for suffix in ('有限公司', '有限责任公司', '个体工商户', '个人独资企业')):
                    names.add(value)
            names.update(company_names(value))
    elif isinstance(data, list):
        for value in data:
            names.update(company_names(value))
    return names


async def lookup(query, exact=False):
    url, key = credentials()
    if not key:
        return [], Step(action='企查查 MCP', status='not_configured', detail='未配置企查查官方 MCP 密钥'), None
    try:
        from mcp import ClientSession
        from mcp.client.streamable_http import streamablehttp_client
    except ImportError:
        return [], Step(action='企查查 MCP', status='failed', detail='请先安装 backend/requirements.txt 中的官方 MCP SDK'), None
    try:
        parsed = urlparse(url)
        valid_url = parsed.scheme == 'https' and (parsed.hostname == 'qcc.com' or (parsed.hostname or '').endswith('.qcc.com')) and not parsed.username and not parsed.password and parsed.port in (None,443)
    except ValueError:
        valid_url = False
    if not valid_url:
        return [], Step(action='企查查 MCP', status='failed', detail='仅允许官方 HTTPS MCP 地址，请核对控制台配置'), None
    # Explicit server-admin mapping, never model-generated tool names/arguments.
    rows, names, outcomes = [], set(), []
    try:
        mapping = json.loads(os.getenv('QCC_MCP_TOOLS') or json.dumps(DEFAULT_TOOLS))
        if not isinstance(mapping, dict) or not 1 <= len(mapping) <= 5:
            raise ValueError('invalid_qcc_tools')
        async with asyncio.timeout(70):
            async with streamablehttp_client(url, headers={'Authorization': 'Bearer ' + key}, timeout=timedelta(seconds=20),
                httpx_client_factory=lambda **kwargs: httpx.AsyncClient(**kwargs, trust_env=False, follow_redirects=False)) as (read, write, _):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    offered = {t.name: t for t in (await session.list_tools()).tools}
                    for tool_name, field in mapping.items():
                        if not exact and tool_name != 'get_company_registration_info':
                            continue
                        tool = offered.get(tool_name)
                        if not isinstance(tool_name, str) or not isinstance(field, str) or not tool or not tool_name.startswith(('get_', 'query_', 'search_')):
                            outcomes.append(str(tool_name)+'：工具未提供或不允许调用')
                            continue
                        schema = tool.inputSchema
                        if field == 'auto':
                            field = next((key for key in ('keyword','searchKey','companyName','company_name','enterpriseName','keyWord','query','name')
                                if schema.get('properties', {}).get(key, {}).get('type') == 'string' and not set(schema.get('required', [])) - {key}), '')
                        if field not in schema.get('properties', {}) or set(schema.get('required', [])) - {field}:
                            outcomes.append(tool_name+'：参数配置与接口不匹配')
                            continue
                        result = await session.call_tool(tool_name, arguments={field: query})
                        if result.isError:
                            outcomes.append(tool_name+'：工具返回错误')
                            continue
                        data = result.structuredContent
                        if data is None:
                            texts = [c.text for c in result.content if c.type == 'text']
                            try:
                                data = json.loads('\n'.join(texts))
                            except (ValueError, TypeError):
                                continue  # Unstructured text alone cannot establish company identity.
                        found = primary_names(data)
                        if not found or (exact and found != {query}):
                            outcomes.append(tool_name+'：主体未匹配')
                            continue
                        if not exact and len(found) != 1:
                            continue
                        name = query if exact else next(iter(found))
                        parts = to_evidence(tool_name,data,name,now())
                        outcomes.append(tool_name+('：已取得资料' if parts else '：无可用记录'))
                        if parts:
                            names.add(name)
                            rows.extend(parts)
    except Exception:
        step = Step(action='企查查 MCP',status='partial' if rows else 'failed',detail='授权 MCP 部分调用未完成；已取得的资料保留，请核对权限与额度。',source_ids=[s.id for s in rows])
    else:
        step = Step(action='企查查 MCP',status='completed' if rows else 'no_usable_records',
                    detail=f'官方 MCP 返回 {len(rows)} 段可归属主体的材料。'+'；'.join(outcomes),source_ids=[s.id for s in rows])
    LAST.update(status=step.status, detail=step.detail, checked_at=now())
    return rows, step, next(iter(names)) if len(names)==1 else None
