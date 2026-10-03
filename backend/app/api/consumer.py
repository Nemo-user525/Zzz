import asyncio
from fastapi import APIRouter, Response, HTTPException, Request
from pydantic import BaseModel, SecretStr, Field
from fastapi.responses import RedirectResponse
from urllib.parse import urlsplit
from app.schemas.consumer import DiscoveryInput, AnalysisInput, Discovery, Analysis
from app.services import consumer, consumer_criteria, consumer_model, qcc, consumer_progress
from app.services import consumer_qcc_session, consumer_workbuddy, workbuddy_client, consumer_qcc_mcp
import logging
import os
import time
import uuid
from typing import Literal

router = APIRouter(prefix='/api/consumer', tags=['消费者实时调查'])
gate = asyncio.Semaphore(3)
jobs = {}


class _HideOAuthCode(logging.Filter):
    def filter(self, record):
        if isinstance(record.args, tuple) and len(record.args) == 5 and str(record.args[2]).startswith(workbuddy_client.CALLBACK):
            record.args = (*record.args[:2], workbuddy_client.CALLBACK, *record.args[3:])
        return True


logging.getLogger('uvicorn.access').addFilter(_HideOAuthCode())


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
    if consumer_workbuddy.selected():raise HTTPException(409,detail='当前使用 WorkBuddy 企查查连接器，请在 WorkBuddy 管理授权')
    if consumer_qcc_mcp.selected():raise HTTPException(409,detail='当前使用企查查官方 MCP，不需要网页 Cookie')
    try:consumer_qcc_session.configure(body.cookie.get_secret_value())
    except ValueError as exc:raise HTTPException(422,detail=str(exc))
    return consumer_qcc_session.status()


@router.get('/qcc-session')
def qcc_session_status(request: Request, response: Response):
    response.headers['Cache-Control']='no-store'
    if consumer_workbuddy.selected():return consumer_workbuddy.status() | {'configurable':bool(local_operator(request))}
    if consumer_qcc_mcp.selected():return consumer_qcc_mcp.status()
    return consumer_qcc_session.status() | {'configurable':bool(local_operator(request))}


def workbuddy_operator(request):
    origin = request.headers.get('origin')
    if not local_operator(request) or (origin and urlsplit(origin).netloc != request.url.netloc):
        raise HTTPException(403, detail='仅可在本机页面配置 WorkBuddy')


class WorkBuddyConfig(BaseModel):
    client_id: str = Field(min_length=2, max_length=256)
    client_secret: SecretStr = Field(min_length=2, max_length=4096)
    redirect_uri: str = Field(max_length=2048)


@router.post('/workbuddy/config')
def configure_workbuddy(body: WorkBuddyConfig, request: Request, response: Response):
    workbuddy_operator(request)
    try:
        workbuddy_client.configure(body.client_id.strip(), body.client_secret.get_secret_value().strip(), body.redirect_uri.strip())
    except workbuddy_client.WorkBuddyError as exc:
        raise HTTPException(422, detail=str(exc)) from None
    response.headers['Cache-Control'] = 'no-store'
    return workbuddy_client.status()


@router.post('/workbuddy/authorize')
def authorize_workbuddy(request: Request, response: Response):
    workbuddy_operator(request)
    try:
        if urlsplit(workbuddy_client.redirect_uri()).hostname != request.url.hostname:
            raise HTTPException(422, detail='请用注册回调地址的同一主机名打开本页再授权')
        url, browser = workbuddy_client.begin_auth()
    except workbuddy_client.WorkBuddyError as exc:
        raise HTTPException(422, detail=str(exc)) from None
    response.set_cookie('xray_wb_auth', browser, max_age=600, httponly=True, samesite='lax', secure=request.url.scheme == 'https', path=workbuddy_client.CALLBACK)
    response.headers['Cache-Control'] = 'no-store'
    return {'authorization_url':url}


@router.get('/workbuddy/callback')
async def workbuddy_callback(request: Request, code: str = '', state: str = '', error: str = ''):
    outcome = 'connected'
    try:
        if error:
            raise workbuddy_client.WorkBuddyError('auth_required')
        await workbuddy_client.finish_auth(state, request.cookies.get('xray_wb_auth', ''), code)
    except workbuddy_client.WorkBuddyError as exc:
        outcome = exc.code
    response = RedirectResponse('/?workbuddy=' + outcome, status_code=303, headers={'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer'})
    response.delete_cookie('xray_wb_auth', path=workbuddy_client.CALLBACK)
    return response


@router.get('/capabilities')
def capabilities(request: Request):
    workbuddy = consumer_workbuddy.selected()
    mcp = not workbuddy and consumer_qcc_mcp.selected()
    connection = consumer_workbuddy.status() if workbuddy else consumer_qcc_mcp.status() if mcp else consumer_qcc_session.status()
    return {'search': 'public_360_bing_sogou',
            'search_providers': ['360 公开网页', 'Bing 公开 RSS', '搜狗公开网页'] + (['Tavily'] if os.getenv('TAVILY_API_KEY') else []) + (['博查'] if os.getenv('BOCHA_API_KEY') else []),
            'qcc_provider': 'workbuddy' if workbuddy else 'qcc_mcp' if mcp else 'direct',
            'qcc_configured': connection['configured'] if workbuddy or mcp else all(qcc.credentials()), 'llm_mode': consumer_model.effective_mode(),
            'model_name': consumer_model.model_name(),
            'qcc_web_session':connection, 'qcc_session_configurable':bool(local_operator(request)) and not (workbuddy or mcp),
            'agent_framework': 'LangGraph', 'agent_enabled': consumer_model.effective_mode() != 'offline',
            'xiaohongshu': 'public_search_index_only',
            'meituan': 'public_search_index_only', 'meituan_api': 'not_configured',
            'criteria': consumer_criteria.reference('')}


def enterprise_agent_status():
    """Report the requested agent independently from the default registry adapter."""
    connection = consumer_workbuddy.status()
    active = ('workbuddy' if consumer_workbuddy.selected() else
              'qcc_mcp' if consumer_qcc_mcp.selected() else 'direct')
    return connection | {
        'active_registry_provider': active,
        'selected': active == 'workbuddy',
        'service': '企查查企业查询',
        'scope': 'WorkBuddy 本地助理调用已授权的企查查企业连接器；结果只来自本次回传。',
    }


@router.get('/enterprise-agent/status')
def get_enterprise_agent_status(request: Request, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    return enterprise_agent_status() | {'configurable': bool(local_operator(request))}


class EnterpriseAgentQuery(BaseModel):
    model_config = {'extra': 'forbid', 'str_strip_whitespace': True}
    company_name: str = Field(min_length=2, max_length=100, pattern=r'^[^\x00-\x1f\x7f]+$')
    identity_confirmed: Literal[True]


@router.post('/enterprise-agent/query')
async def query_enterprise_agent(body: EnterpriseAgentQuery, response: Response):
    """Explicit WorkBuddy path: never substitute MCP or a local model reply."""
    response.headers['Cache-Control'] = 'no-store'
    rows, step, matched = await consumer_workbuddy.lookup(body.company_name, exact=True)
    return {
        'provider': 'workbuddy',
        'service': '企查查企业查询',
        'company_name': body.company_name,
        'matched_company_name': matched,
        'status': step.status,
        'message': step.detail,
        'sources': [row.model_dump(mode='json') for row in rows],
        'step': step.model_dump(mode='json'),
    }


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
