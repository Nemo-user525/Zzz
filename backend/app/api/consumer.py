import asyncio
from fastapi import APIRouter, Response, HTTPException, Request
from pydantic import BaseModel, SecretStr
from urllib.parse import urlsplit
from app.schemas.consumer import DiscoveryInput, AnalysisInput, Discovery, Analysis
from app.services import consumer, consumer_criteria, consumer_model, qcc, consumer_progress
from app.services import consumer_qcc_session
import os
import time
import uuid

router = APIRouter(prefix='/api/consumer', tags=['消费者实时调查'])
gate = asyncio.Semaphore(3)
jobs = {}


def local_operator(request):
    loopback={'127.0.0.1','localhost','::1'}
    return (request.url.hostname in loopback and request.client and request.client.host in loopback
            and not any(request.headers.get(key) for key in ('forwarded','x-forwarded-for','cf-connecting-ip','x-forwarded-host'))
            and (not request.headers.get('origin') or urlsplit(request.headers['origin']).hostname in loopback))


class SessionInput(BaseModel):
    cookie: SecretStr


@router.post('/qcc-session')
async def set_qcc_session(body: SessionInput, request: Request):
    if not local_operator(request):raise HTTPException(403,detail='仅可在本机页面配置企查查会话')
    try:consumer_qcc_session.configure(body.cookie.get_secret_value())
    except ValueError as exc:raise HTTPException(422,detail=str(exc))
    return consumer_qcc_session.status()


@router.get('/qcc-session')
def qcc_session_status(request: Request, response: Response):
    response.headers['Cache-Control']='no-store'
    return consumer_qcc_session.status() | {'configurable':bool(local_operator(request))}


@router.get('/capabilities')
def capabilities(request: Request):
    return {'search': 'public_360_bing_sogou',
            'search_providers': ['360 公开网页', 'Bing 公开 RSS', '搜狗公开网页'] + (['Tavily'] if os.getenv('TAVILY_API_KEY') else []) + (['博查'] if os.getenv('BOCHA_API_KEY') else []),
            'qcc_configured': all(qcc.credentials()) or bool(os.getenv('QCC_MCP_URL') and os.getenv('QCC_MCP_API_KEY')), 'llm_mode': consumer_model.effective_mode(),
            'model_name': consumer_model.model_name(),
            'qcc_web_session':consumer_qcc_session.status(), 'qcc_session_configurable':bool(local_operator(request)),
            'agent_framework': 'LangGraph', 'agent_enabled': consumer_model.effective_mode() != 'offline',
            'xiaohongshu': 'public_search_index_only', 'criteria': consumer_criteria.reference('')}


async def bounded(action, body):
    try:
        await asyncio.wait_for(gate.acquire(), timeout=.2)
    except TimeoutError:
        raise HTTPException(429, detail={'code': 'research_busy', 'message': '当前调查较多，请稍后重试。', 'details': []})
    try:
        return await asyncio.wait_for(action(body), timeout=1800 if action == consumer.analysis else 180)
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


@router.post('/jobs', status_code=202)
async def start_job(body: AnalysisInput, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    for ident, job in list(jobs.items()):
        if job['expires'] < time.monotonic():
            job['task'].cancel()
            del jobs[ident]
    if len(jobs) >= 30 or sum(j['status'] == 'running' for j in jobs.values()) >= 3:
        raise HTTPException(429, detail='当前调查较多，请稍后重试')
    ident = uuid.uuid4().hex
    job = {'status': 'running', 'message': '准备调查…', 'expires': time.monotonic()+3600, 'result': None}
    jobs[ident] = job

    async def work():
        token = consumer_progress.callback.set(lambda message: job.update(message=message))
        try:
            result = await bounded(consumer.analysis, body)
            job.update(status='completed', message='调查完成', result=result.model_dump(mode='json'))
        except asyncio.CancelledError:
            job.update(status='cancelled', message='调查已取消')
        except Exception:
            # Transport URLs, keys and upstream response bodies never reach the UI.
            job.update(status='failed', message='调查未完成，请重试；已有关键词资料仍可查看。')
        finally:
            consumer_progress.callback.reset(token)
    job['task'] = asyncio.create_task(work())
    return {'job_id': ident}


@router.get('/jobs/{ident}')
async def get_job(ident: str, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    job = jobs.get(ident)
    if not job or job['expires'] < time.monotonic():
        raise HTTPException(404, detail='调查记录已过期，请重新查询')
    return {k: job[k] for k in ('status', 'message', 'result')}


@router.delete('/jobs/{ident}', status_code=204)
async def cancel_job(ident: str):
    job = jobs.pop(ident, None)
    if job:
        job['task'].cancel()
