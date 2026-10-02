import asyncio
from contextlib import asynccontextmanager
from types import SimpleNamespace
import pytest
from app.services import consumer_qcc_mcp as qcc
from app.api import consumer as api
from app.schemas.consumer import AnalysisInput
from fastapi import Response


def test_registered_individual_business_does_not_need_company_suffix():
    assert qcc.company_names({'CompanyName':'杭州市拱墅区某某健身工作室'})=={'杭州市拱墅区某某健身工作室'}


def test_mcp_uses_authorized_discovery_schema_and_identity(monkeypatch):
    import mcp
    import mcp.client.streamable_http as transport
    monkeypatch.setenv('QCC_MCP_URL','https://mcp.qcc.com/test')
    monkeypatch.setenv('QCC_MCP_API_KEY','test-key')
    monkeypatch.setenv('QCC_MCP_TOOLS','{"get_company_registration_info":"auto","delete_company":"id"}')
    called=[]
    @asynccontextmanager
    async def connection(url,headers,**kwargs):
        assert headers=={'Authorization':'Bearer test-key'}
        yield None,None,None
    class Session:
        def __init__(self,*args):pass
        async def __aenter__(self):return self
        async def __aexit__(self,*args):pass
        async def initialize(self):called.append('initialize')
        async def list_tools(self):
            called.append('list_tools')
            return SimpleNamespace(tools=[SimpleNamespace(name='get_company_registration_info',inputSchema={'properties':{'companyName':{'type':'string'}},'required':['companyName']})])
        async def call_tool(self,name,arguments):
            called.append((name,arguments))
            return SimpleNamespace(isError=False,structuredContent={'company':{'name':'甲方服务有限公司','status':'存续'}},content=[])
    monkeypatch.setattr(mcp,'ClientSession',Session)
    monkeypatch.setattr(transport,'streamablehttp_client',connection)
    rows,step,name=asyncio.run(qcc.lookup('甲方服务有限公司',exact=True))
    assert len(rows)==1 and name=='甲方服务有限公司' and step.status=='completed'
    assert called==['initialize','list_tools',('get_company_registration_info',{'companyName':'甲方服务有限公司'})]
    assert rows[0].verification_status=='provider_response'
    rows,step,name=asyncio.run(qcc.lookup('另一家公司有限公司',exact=True))
    assert not rows and name is None


def test_mcp_invalid_mapping_is_safe_failure(monkeypatch):
    monkeypatch.setenv('QCC_MCP_URL','https://mcp.qcc.com/test')
    monkeypatch.setenv('QCC_MCP_API_KEY','test-key')
    monkeypatch.setenv('QCC_MCP_TOOLS','not-json')
    rows,step,name=asyncio.run(qcc.lookup('测试公司'))
    assert not rows and step.status=='failed' and 'test-key' not in step.detail


def test_job_cancellation_stops_actual_work(monkeypatch):
    async def run():
        started=asyncio.Event(); stopped=asyncio.Event()
        async def work(body):
            started.set()
            try:await asyncio.Event().wait()
            finally:stopped.set()
        monkeypatch.setattr(api.consumer,'analysis',work)
        response=await api.start_job(AnalysisInput(investigation_id='i',candidate_id='c'),Response())
        await started.wait()
        await api.cancel_job(response['job_id'])
        await asyncio.wait_for(stopped.wait(),1)
        assert response['job_id'] not in api.jobs
    asyncio.run(run())
