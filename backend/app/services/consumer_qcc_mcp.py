"""Authorized QCC Streamable HTTP MCP. No credential harvesting or auth bypass."""
import asyncio
import hashlib
import json
import os
import httpx
from datetime import timedelta
from urllib.parse import urlparse
from app.schemas.consumer import Evidence, Step
from app.services.consumer_search import now

DOCS = 'https://agent.qcc.com/guide'


def configured():
    return bool(os.getenv('QCC_MCP_URL', '').strip() and os.getenv('QCC_MCP_API_KEY', '').strip())


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
    try:
        from mcp import ClientSession
        from mcp.client.streamable_http import streamablehttp_client
    except ImportError:
        return [], Step(action='企查查 MCP', status='failed', detail='请先安装 backend/requirements.txt 中的官方 MCP SDK'), None
    url = os.environ['QCC_MCP_URL'].strip()
    parsed = urlparse(url)
    if parsed.scheme != 'https' or not (parsed.hostname == 'qcc.com' or (parsed.hostname or '').endswith('.qcc.com')) or parsed.username or parsed.password:
        return [], Step(action='企查查 MCP', status='failed', detail='仅允许官方 HTTPS MCP 地址，请核对控制台配置'), None
    # Explicit server-admin mapping, never model-generated tool names/arguments.
    rows, names = [], set()
    try:
        mapping = json.loads(os.getenv('QCC_MCP_TOOLS', '{"get_company_registration_info":"auto"}'))
        if not isinstance(mapping, dict) or not 1 <= len(mapping) <= 5:
            raise ValueError('invalid_qcc_tools')
        async with asyncio.timeout(70):
            async with streamablehttp_client(url, headers={'Authorization': 'Bearer ' + os.environ['QCC_MCP_API_KEY']}, timeout=timedelta(seconds=20),
                httpx_client_factory=lambda **kwargs: httpx.AsyncClient(**kwargs, trust_env=False, follow_redirects=False)) as (read, write, _):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    offered = {t.name: t for t in (await session.list_tools()).tools}
                    for tool_name, field in mapping.items():
                        tool = offered.get(tool_name)
                        if not isinstance(tool_name, str) or not isinstance(field, str) or not tool or not tool_name.startswith(('get_', 'query_', 'search_')):
                            continue
                        schema = tool.inputSchema
                        if field == 'auto':
                            field = next((key for key in ('keyword','searchKey','companyName','company_name','enterpriseName','keyWord','query','name')
                                if schema.get('properties', {}).get(key, {}).get('type') == 'string' and not set(schema.get('required', [])) - {key}), '')
                        if field not in schema.get('properties', {}) or set(schema.get('required', [])) - {field}:
                            continue
                        result = await session.call_tool(tool_name, arguments={field: query})
                        if result.isError:
                            continue
                        data = result.structuredContent
                        if data is None:
                            texts = [c.text for c in result.content if c.type == 'text']
                            try:
                                data = json.loads('\n'.join(texts))
                            except (ValueError, TypeError):
                                continue  # Unstructured text alone cannot establish company identity.
                        found = company_names(data)
                        if not found or (exact and query not in found):
                            continue
                        if not exact and len(found) != 1:
                            continue
                        name = query if exact else next(iter(found))
                        names.add(name)
                        content = json.dumps(data, ensure_ascii=False)
                        # Keep a bounded exact provider excerpt; no empty-result rows.
                        pos = content.find(name)
                        excerpt = content[max(0, pos-40):pos+430]
                        rows.append(Evidence(id=hashlib.sha256((tool_name+content).encode()).hexdigest()[:20],
                            title=name+' · '+tool_name, url=DOCS, publisher='企查查官方 MCP', excerpt=excerpt,
                            fetched_at=now(), verification_status='provider_response', channel='registry',
                            purpose='企查查 MCP', page_status='授权 MCP 返回字段；链接为官方接入说明'))
    except Exception:
        return [], Step(action='企查查 MCP', status='failed', detail='授权 MCP 调用未完成；请核对密钥、工具参数、权限与额度'), None
    return rows, Step(action='企查查 MCP', status='completed' if rows else 'no_usable_records',
        detail=f'官方 MCP 返回 {len(rows)} 份可归属主体的材料', source_ids=[s.id for s in rows]), next(iter(names)) if len(names)==1 else None
