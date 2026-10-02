"""Short polling requests avoid proxy timeouts while bounded research runs."""
import asyncio
import time
import uuid
from fastapi import APIRouter, HTTPException, Response
from app.schemas.company_research import ResearchInput, DiscoveryInput
from app.services import company_research

router = APIRouter(prefix='/api/company-research', tags=['company research'])
jobs = {}
tasks = set()
gate = asyncio.Semaphore(2)


@router.get('/capabilities')
def capabilities():
    model, key = company_research.model_config()
    return {'model_configured':bool(model and key), 'model':model or None, 'search_provider':'博查联网搜索' if key else '公开网页适配器'}


@router.post('/discovery')
async def discovery(body: DiscoveryInput, response: Response):
    response.headers['Cache-Control']='no-store'
    return await company_research.discover(body.query)


def clean_jobs():
    for ident in list(jobs):
        if time.monotonic()-jobs[ident]['started']>1800:
            del jobs[ident]


async def execute(ident, body):
    try:
        await asyncio.wait_for(company_research.run(body,jobs[ident]),timeout=240)
    except asyncio.CancelledError:
        raise
    except Exception:
        if ident in jobs:
            jobs[ident].update(stage='failed',message='本次研究未完成，请重试；未生成企业结论。')
    finally:
        gate.release()


@router.post('/jobs', status_code=202)
async def start(body:ResearchInput, response:Response):
    response.headers['Cache-Control']='no-store'
    clean_jobs()
    # Same subject/input within 10 minutes reuses the research; audience changes never rerun paid calls.
    for ident, job in jobs.items():
        if job['input']==body.model_dump() and time.monotonic()-job['started']<600 and job['stage']!='failed' and job.get('model_status') not in {'failed','no_evidence','not_configured'}:
            return {'id':ident,'reused':True}
    try:
        await asyncio.wait_for(gate.acquire(),timeout=.1)
    except TimeoutError:
        raise HTTPException(429,'当前有研究正在执行，请稍后重试。')
    if len(jobs)>=24:
        finished = next((i for i,j in jobs.items() if j['stage'] in {'completed','failed'}),None)
        if finished: del jobs[finished]
    ident=uuid.uuid4().hex
    jobs[ident]={'id':ident,'input':body.model_dump(),'started':time.monotonic(),'stage':'queued','message':'准备开始联网研究','completed':0,'total':0,'sources_count':0}
    task=asyncio.create_task(execute(ident,body)); tasks.add(task);task.add_done_callback(tasks.discard)
    return {'id':ident,'reused':False}


@router.get('/jobs/{ident}')
def get(ident:str,response:Response):
    response.headers['Cache-Control']='no-store'
    clean_jobs()
    if ident not in jobs:
        raise HTTPException(404,'研究已过期或服务已重启，请重新开始。')
    return {k:v for k,v in jobs[ident].items() if k!='started'}
