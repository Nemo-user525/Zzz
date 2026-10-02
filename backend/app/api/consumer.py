import asyncio
from fastapi import APIRouter, Response, HTTPException
from app.schemas.consumer import DiscoveryInput, AnalysisInput, Discovery, Analysis
from app.services import consumer, consumer_criteria, llm, qcc
import os

router = APIRouter(prefix='/api/consumer', tags=['消费者实时调查'])
gate = asyncio.Semaphore(3)


@router.get('/capabilities')
def capabilities():
    return {'search': 'tavily' if os.getenv('TAVILY_API_KEY') else 'public_web_adapter',
            'qcc_configured': all(qcc.credentials()), 'llm_mode': llm.effective_mode(),
            'agent_framework': 'LangGraph', 'agent_enabled': llm.effective_mode() != 'offline',
            'xiaohongshu': 'public_search_index_only', 'criteria': consumer_criteria.reference('')}


async def bounded(action, body):
    try:
        await asyncio.wait_for(gate.acquire(), timeout=.2)
    except TimeoutError:
        raise HTTPException(429, detail={'code': 'research_busy', 'message': '当前调查较多，请稍后重试。', 'details': []})
    try:
        return await asyncio.wait_for(action(body), timeout=180)
    except TimeoutError:
        raise HTTPException(504, detail={'code': 'research_timeout', 'message': '公开来源响应超时，请重试或缩短关键词。', 'details': []})
    finally:
        gate.release()


@router.post('/discovery', response_model=Discovery)
async def discover(body: DiscoveryInput, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    return await bounded(consumer.discovery, body)


@router.post('/analyses', response_model=Analysis)
async def analyse(body: AnalysisInput, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    return await bounded(consumer.analysis, body)
