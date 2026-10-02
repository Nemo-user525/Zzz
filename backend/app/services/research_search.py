"""Bocha gateway search with explicit failures and public-web fallback when unconfigured."""
import asyncio
import os
from datetime import date
import httpx
from app.services import consumer_search as public
from app.schemas.consumer import Step

GATE = asyncio.Semaphore(4)
URL = 'https://tokendance.space/gateway/bocha/v1/web-search'


def parse(payload, purpose):
    if payload.get('code') != 200:
        raise ValueError('provider_error')
    rows = payload.get('data', {}).get('webPages', {}).get('value')
    if not isinstance(rows, list):
        raise ValueError('provider_schema')
    sources = []
    for row in rows[:6]:
        if not isinstance(row, dict):
            continue
        source = public.make_source(str(row.get('name') or ''), str(row.get('url') or ''), str(row.get('summary') or row.get('snippet') or ''), purpose)
        if not source:
            continue
        raw_date = str(row.get('datePublished') or '')[:10]
        try:
            parsed = date.fromisoformat(raw_date)
            if parsed <= date.today():
                source.published_at = parsed.isoformat()
                source.date_semantics = '搜索服务标注的网页发布日期，未核实；不是事件发生日'
        except ValueError:
            pass
        sources.append(source)
    return sources


async def search(query, purpose):
    key = os.getenv('TOKENDANCE_API_KEY', '').strip()
    if not key:
        return await public.search(query, purpose)
    async with GATE:
        try:
            async with httpx.AsyncClient(timeout=18, trust_env=False, follow_redirects=False) as client:
                response = await client.post(URL, headers={'Authorization': 'Bearer ' + key}, json={'query': query, 'freshness': 'noLimit', 'summary': True, 'count': 6})
                response.raise_for_status()
                if len(response.content) > 2_000_000:
                    raise ValueError('size')
                rows = parse(response.json(), purpose)
                return rows, Step(action=purpose, status='completed', detail=f'博查联网搜索：{query}；返回 {len(rows)} 条线索', source_ids=[r.id for r in rows])
        except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError):
            return [], Step(action=purpose, status='failed', detail=f'查询“{query}”未完成；不能据此认定没有相关记录')
