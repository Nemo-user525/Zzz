"""Use the existing licensed QCC adapter without implying store ownership."""
import hashlib
import json
from fastapi import HTTPException
from app.schemas.consumer import Evidence, Step
from app.services import qcc, consumer_qcc_mcp, consumer_qcc_web, consumer_workbuddy


async def lookup(query, exact=False):
    if consumer_workbuddy.selected():
        return await consumer_workbuddy.lookup(query, exact)
    if consumer_qcc_mcp.configured():
        return await consumer_qcc_mcp.lookup(query, exact)
    if not all(qcc.credentials()):
        rows, name = consumer_qcc_web.lookup(query, exact)
        if rows:
            return rows, Step(action='企查查网页导入',status='cached',detail='使用本人网页响应导入的企业字段，未执行本次在线工商核验',source_ids=[r.id for r in rows]), name
        return [], Step(action='企查查', status='not_configured', detail='未配置企查查 API 736；未执行工商核验'), None
    try:
        data = await qcc.lookup(query)
    except HTTPException as exc:
        return [], Step(action='企查查', status='failed', detail=exc.detail['message']), None
    name = data['company']['name']
    if exact and name != query:
        return [], Step(action='企查查', status='identity_mismatch', detail='接口返回主体与用户确认名称不一致，已排除'), None
    chunks = [('identity', '企业身份', json.dumps(data['company'], ensure_ascii=False))]
    chunks += [(g['id'], g['title'], json.dumps(g['records'][:3], ensure_ascii=False))
               for g in data['groups'] if g['available'] and g['records']]
    rows = [Evidence(id=hashlib.sha256((name + key + content).encode()).hexdigest()[:20],
        title=name + ' · 企查查' + title, url=qcc.DOCS, publisher='企查查 API 736',
        excerpt=(name + '；' + content)[:480], fetched_at=data['retrieved_at'],
        verification_status='provider_response', channel='registry', purpose='企查查',
        page_status='已取得接口原始字段；链接为接口说明，未核对原始公示') for key, title, content in chunks]
    return rows, Step(action='企查查', status='completed', detail='已调用企业风险扫描 API；空字段不代表无风险，门店归属仍待核对', source_ids=[r.id for r in rows]), name
