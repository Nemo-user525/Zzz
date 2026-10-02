"""Controlled tool responses test real graph execution; no fixture in app runtime."""
import asyncio
import json
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.schemas.consumer import DiscoveryInput, AnalysisInput, Step, AgentFinding
from app.services import consumer, consumer_agent as agent, consumer_search as web, consumer_criteria as criteria, consumer_registry, consumer_model

NAME = '测试健身服务有限公司'
REFERENCE = {'status':'trained_topic_router', 'sample_count':5, 'human_reviewed_count':0,
             'matches':[{'category':'regulatory_penalty','examples':[]}], 'limitation':'测试主题参考，不能作为当前公司证据'}


def source(text=None, url='https://research.example/article'):
    return web.make_source(NAME + '公开材料', url, text or NAME + '发布会员退款安排及情况说明，具体门店尚待核对。', '测试资料')


def test_dates_in_company_descriptions_are_not_identity_candidates():
    assert consumer.extract_names('成立于2021年11月26日的有限责任公司') == []
    assert consumer.extract_names('版权所有：杭州乐刻网络技术有限公司') == ['杭州乐刻网络技术有限公司']


def test_registry_navigation_tabs_are_not_adverse_event_evidence():
    s=source(NAME+'主要人员 变更记录 专利信息 行政处罚 股东信息 控股企业 企业年报 经营异常 抽查检查')
    assert not web.signal_matches(s, '变更|处罚|经营异常')


@pytest.fixture
def rig(monkeypatch, tmp_path):
    from app.services import workbuddy_client
    monkeypatch.setattr(workbuddy_client, 'ROOT', tmp_path)
    monkeypatch.setattr(workbuddy_client, 'APP_FILE', tmp_path / 'app.json')
    monkeypatch.setattr(workbuddy_client, 'TOKEN_FILE', tmp_path / 'token.json')
    for name in ('WORKBUDDY_CLIENT_ID', 'WORKBUDDY_CLIENT_SECRET', 'WORKBUDDY_ACCESS_TOKEN'):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv('LLM_PROVIDER','offline')
    monkeypatch.delenv('CONSUMER_MODEL_PROVIDER',raising=False)
    monkeypatch.delenv('QCC_MCP_URL',raising=False)
    monkeypatch.delenv('QCC_MCP_API_KEY',raising=False)
    monkeypatch.delenv('QCC_APP_KEY',raising=False)
    monkeypatch.delenv('QCC_SECRET_KEY',raising=False)
    monkeypatch.setattr(criteria, 'reference', lambda text: REFERENCE)
    seen, saved = [], {}
    async def search(query,purpose):
        seen.append((query,purpose))
        row = source()
        return [row], Step(action=purpose,status='completed',detail=query,source_ids=[row.id])
    async def read(row):
        return ''
    monkeypatch.setattr(web,'search',search)
    monkeypatch.setattr(web,'read_page',read)
    monkeypatch.setattr(consumer.cache,'save',lambda d:saved.update({d.investigation_id:d}))
    monkeypatch.setattr(consumer.cache,'get',lambda ident=None,**kwargs:saved.get(ident))
    return seen, saved


def discover():
    return asyncio.run(consumer.discovery(DiscoveryInput(query=NAME)))


def investigate(d, **kwargs):
    return asyncio.run(consumer.analysis(AnalysisInput(investigation_id=d.investigation_id,candidate_id=d.candidates[0].id,**kwargs)))


def test_actual_graph_searches_without_database_match_or_model(rig,monkeypatch):
    monkeypatch.setattr(criteria,'reference',lambda t: {**REFERENCE,'status':'not_trained','sample_count':0,'matches':[]})
    d = discover()
    r = investigate(d)
    assert r.mode == 'live_search_rules' and not r.agent_model_used and not r.fallback
    assert r.agent_framework == 'LangGraph' and len(r.indicators)==6
    assert set(agent.TOPICS) <= {purpose for _,purpose in rig[0]}
    assert r.criteria['sample_count']==0
    assert r.identity.relationship_status != '已核实'
    assert all(c.event_date is None for c in r.changes)
    assert not any(i.status=='safe' for i in r.indicators)


def test_amount_does_not_change_company_indicators(rig):
    d=discover()
    a,b=investigate(d,amount_yuan=10),investigate(d,amount_yuan=100000)
    assert a.indicators==b.indicators


def test_learned_topic_adds_queries_without_replacing_independent_search(rig,monkeypatch):
    monkeypatch.setattr(criteria,'reference',lambda text:{**REFERENCE,'matches':[{'category':'regulatory_penalty','search_terms':'处罚 整改 后续','examples':[]}]})
    investigate(discover())
    assert (NAME+' 处罚 整改 后续','数据库建议复核') in rig[0]
    assert set(agent.TOPICS) <= {p for _,p in rig[0]}


def test_brand_only_sources_do_not_become_company_indicators(rig,monkeypatch):
    from app.services.consumer_indicators import build
    d=discover()
    brand=web.make_source('测试品牌停业','https://brand.example/article','测试品牌门店停业、未退款，经营主体未知','品牌门店补查')
    brand.scope='brand_context'
    rows=build(d.candidates[0],[brand],[],[])
    assert not any(brand.id in x.source_ids for x in rows)


def test_langgraph_model_actually_selects_tools_and_synthesizes(rig,monkeypatch):
    monkeypatch.setattr(agent.llm,'effective_mode',lambda:'openai_compatible')
    calls=[]
    async def model(instruction,payload,schema,**kwargs):
        calls.append(payload)
        assert payload['criteria']['sample_count']==5
        assert 'amount_yuan' not in payload['context']
        if schema==agent.Plan:
            assert kwargs['reasoning'] is False
            return agent.Plan(search_terms=['最新门店承接公告'] if len(calls)==1 else [])
        if schema==agent.RiskDraft:
            assert kwargs.get('reasoning',True) is True
            assert payload['reviews']['status']=='completed'
            assert len(payload['cashflow']['scenarios'])==3
            return agent.RiskDraft(level='undetermined',explanation='资料不足，需要核实门店和后续情况。',reasons=[])
        s=payload['sources'][0]
        return agent.Findings(findings=[AgentFinding(indicator_id='refund',explanation='该片段提及退款安排，需要核对是否涉及本次门店。',citations=[{'source_id':s['id'],'quote':s['excerpt']}],question='公告所列退款是否包含这家门店的课包？')])
    monkeypatch.setattr(consumer_model,'structured',model)
    r=investigate(discover())
    assert r.agent_model_used and r.agent_rounds==1 and not r.fallback
    assert (NAME+' 最新门店承接公告','智能体补查') in rig[0]
    assert any(i.agent_findings for i in r.indicators)
    assert r.criteria['matches'] and len(calls)==4
    assert r.risk.model_assessed and r.risk.level=='undetermined'


def test_agent_loop_is_bounded_even_if_model_keeps_requesting_tools(rig,monkeypatch):
    monkeypatch.setattr(agent.llm,'effective_mode',lambda:'openai_compatible')
    count=0
    async def model(instruction,payload,schema,**kwargs):
        nonlocal count
        count+=1
        if schema==agent.RiskDraft:
            return agent.RiskDraft(level='undetermined',explanation='资料不足，不能评级。',reasons=[])
        return agent.Plan(search_terms=[f'补查资料{count}']) if schema==agent.Plan else agent.Findings(findings=[])
    monkeypatch.setattr(consumer_model,'structured',model)
    r=investigate(discover())
    assert r.agent_rounds==2 and count==4


@pytest.mark.parametrize('bad',['unknown_id','altered_quote','other_company'])
def test_rejects_fabricated_or_cross_company_citations(bad):
    s=source()
    if bad=='other_company':
        s=web.make_source('另一家主体有限公司','https://other.example/article','另一家主体有限公司退款安排','测试')
    finding=AgentFinding(indicator_id='refund',explanation='材料提及退款，仍须核实。',citations=[{'source_id':'nonexistent' if bad=='unknown_id' else s.id,'quote':'不在原文中的虚构引文' if bad=='altered_quote' else s.excerpt}],question='是否包含当前门店与对应订单？')
    with pytest.raises(ValueError):
        agent.validate_findings([finding],[s],NAME)


def test_model_failure_never_becomes_successful_ai_report(rig,monkeypatch):
    monkeypatch.setattr(agent.llm,'effective_mode',lambda:'openai_compatible')
    async def fail(*args,**kwargs):
        raise ValueError('invalid JSON')
    monkeypatch.setattr(consumer_model,'structured',fail)
    r=investigate(discover())
    assert r.fallback and not r.agent_model_used
    assert r.sources and not any(i.agent_findings for i in r.indicators)


def test_no_arbitrary_page_tool_url_is_accepted(rig,monkeypatch):
    monkeypatch.setattr(agent.llm,'effective_mode',lambda:'openai_compatible')
    async def model(instruction,payload,schema,**kwargs):
        if schema==agent.RiskDraft:
            return agent.RiskDraft(level='undetermined',explanation='资料不足，不能评级。',reasons=[])
        return agent.Plan(read_source_ids=['http://127.0.0.1/secret']) if schema==agent.Plan else agent.Findings(findings=[])
    monkeypatch.setattr(consumer_model,'structured',model)
    r=investigate(discover())
    assert r.agent_rounds==0 and r.fallback


def test_failed_search_and_empty_search_have_distinct_states(rig,monkeypatch):
    async def failed(query,purpose):
        return [],Step(action=purpose,status='failed',detail='timeout')
    monkeypatch.setattr(web,'search',failed)
    assert discover().mode=='unavailable'
    async def empty(query,purpose):
        return [],Step(action=purpose,status='completed',detail='no results')
    monkeypatch.setattr(web,'search',empty)
    d=discover()
    assert d.mode=='live_search' and not d.candidates and not d.sources


def test_partial_failure_is_visible_and_all_failure_marks_old_evidence(rig,monkeypatch):
    d=discover()
    async def failed(query,purpose):
        return [],Step(action=purpose,status='failed',detail='timeout')
    monkeypatch.setattr(web,'search',failed)
    r=investigate(d)
    assert r.mode=='cached_evidence' and all(s.cached for s in r.sources)
    # Existing response wording in old materials is a lead, not a newly executed search.
    assert any(t.action=='回应反证' and t.status=='failed' for t in r.trace)


def test_forged_or_expired_candidate_cannot_select_other_company(rig):
    client=TestClient(app)
    d=discover()
    assert client.post('/api/consumer/analyses',json={'investigation_id':d.investigation_id,'candidate_id':'other'}).status_code==422
    assert client.post('/api/consumer/analyses',json={'investigation_id':'expired','candidate_id':'other'}).status_code==409
    assert client.post('/api/consumer/discovery',json={'query':'x'}).status_code==422


def test_registry_identity_mismatch_is_excluded(rig,monkeypatch):
    monkeypatch.setenv('QCC_PROVIDER','direct')
    monkeypatch.setattr(consumer_registry.qcc,'credentials',lambda:('test-key','test-secret'))
    async def lookup(query):
        return {'company':{'name':'其他企业有限公司'}}
    monkeypatch.setattr(consumer_registry.qcc,'lookup',lookup)
    rows,trace,name=asyncio.run(consumer_registry.lookup(NAME,exact=True))
    assert rows==[] and name is None and trace.status=='identity_mismatch'


@pytest.mark.parametrize('url',['http://127.0.0.1/a','http://169.254.169.254/a','http://[::1]/a','file:///secret','https://user:pass@example.com','http://example.local/a','javascript:alert(1)'])
def test_private_and_non_http_sources_rejected(url):
    assert not web.safe_link(url)


def test_empty_or_corrupt_training_model_does_not_invent_reference(tmp_path,monkeypatch):
    monkeypatch.setattr(criteria,'MODEL',tmp_path/'model.json')
    assert criteria.reference('任意公司')['status']=='not_trained'
    criteria.MODEL.write_text('{broken',encoding='utf-8')
    assert criteria.reference('任意公司')['status']=='unavailable'


def test_counter_search_empty_vs_not_executed_are_distinct(rig,monkeypatch):
    from app.services.consumer_indicators import build
    d=discover()
    i=d.candidates[0]
    a=build(i,[],[],[])
    b=build(i,[],[Step(action='回应反证',status='completed',detail='no hits')],[])
    assert next(x for x in a if x.id=='counter').status=='unknown'
    assert next(x for x in b if x.id=='counter').status=='searched'
