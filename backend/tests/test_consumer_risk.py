import asyncio
import json
import pytest
import httpx
from app.services import consumer_risk as risk, consumer_model as model, consumer_search as web
from app.services.consumer_agent import RiskDraft, Plan
from app.schemas.consumer import Evidence

NAME='测试服务有限公司'


def row(host='one.example', text='公司发布停业通知', status='search_excerpt'):
    s=web.make_source(NAME, 'https://'+host+'/notice', NAME+text, '测试')
    s.verification_status=status
    return s


def draft(level, rows, direction='adverse'):
    return RiskDraft(level=level, explanation='当前材料涉及经营状态，仍需核实后续处理。',
        reasons=[{'explanation':'材料声称的经营变化需要结合后续核对。','direction':direction,
                  'citations':[{'source_id':s.id,'quote':s.excerpt} for s in rows]}])


def test_high_needs_independent_sources_and_body():
    a,b=row(),row('two.example',text='涉及会员的退款尚未履行，应核实处理进度')
    assert risk.assess(draft('high',[a,b]),[a,b],NAME,'test',2).level=='medium'
    b.verification_status='page_text'
    assert risk.assess(draft('high',[a,b]),[a,b],NAME,'test',2).level=='high'


def test_reprints_do_not_count_as_independent_risk_support():
    a,b=row(status='page_text'),row('two.example',status='page_text')
    assert risk.assess(draft('high',[a,b]),[a,b],NAME,'test',2).level=='medium'


def test_unresolved_brand_complaints_prevent_low_risk():
    rows=[row('one.example','今日公示登记为存续状态且完成年检',status='page_text'),
          row('two.example','近期公开消费者服务履约说明，正常提供课程',status='page_text'),
          row('city.gov.cn','发布营业许可续期通知及经营范围',status='page_text')]
    d=draft('low',rows,'reassuring')
    assert risk.assess(d,rows,NAME,'test',3).level=='low'
    brand=row('brand.example','品牌门店有退款投诉，经营者未核对');brand.scope='brand_context'
    assert risk.assess(d,rows+[brand],NAME,'test',3).level=='undetermined'


def test_search_date_is_labeled_as_search_metadata_not_event_date():
    s=row(text='发布说明')
    s=web.make_source(NAME,s.url,'2020年5月6日 - '+s.excerpt,'检索')
    assert s.published_at=='2020-05-06' and '不等于事件日' in s.date_semantics
    assert web.make_source(NAME,s.url,'2020年5月6日 -','检索') is None


def test_missing_evidence_is_never_low_or_adverse():
    r=RiskDraft(level='low',explanation='没有搜到风险不能代表安全。',reasons=[])
    assert risk.assess(r,[],NAME,'test',0).level=='undetermined'
    a=row(text='发布正常营业说明',status='page_text')
    assert risk.assess(draft('low',[a],'reassuring'),[a],NAME,'test',1).level=='undetermined'
    assert risk.assess(draft('high',[a],'context'),[a],NAME,'test',1).level=='undetermined'


def test_risk_cannot_cite_brand_or_invented_quote():
    a=row(); d=draft('medium',[a]); a.scope='brand_context'
    with pytest.raises(ValueError):risk.assess(d,[a],NAME,'test',1)
    a.scope='selected_entity'; d.reasons[0].citations[0].quote='这是一段虚构内容'
    with pytest.raises(ValueError):risk.assess(d,[a],NAME,'test',1)


def test_url_dedup_and_diversity_preserve_distinct_api_records():
    a=row(); b=a.model_copy(update={'id':'different','url':a.url+'?utm_source=weibo#share'})
    rows=[row('one.example',text=str(i)).model_copy(update={'url':f'https://one.example/{i}','id':str(i)}) for i in range(30)]
    rows.append(row('two.example'))
    assert len(web.dedupe([a,b]))==1
    assert any(s.publisher=='two.example' for s in web.diverse(rows,limit=5))
    a.channel=b.channel='registry'
    assert len(web.dedupe([a,b]))==2


def test_thinking_is_removed_but_incomplete_reasoning_is_rejected():
    assert model.parse_final('<think>private reasoning</think>{"search_terms":[],"read_source_ids":[]}',Plan)==Plan()
    with pytest.raises(ValueError):model.parse_final('<think>unfinished',Plan)


def test_ollama_requests_thinking_and_uses_only_final_json(monkeypatch):
    monkeypatch.setenv('CONSUMER_MODEL_PROVIDER','ollama')
    original=httpx.AsyncClient
    def serve(request):
        body=json.loads(request.content)
        assert body['think'] is True and body['stream'] is False
        assert body['model']=='qwen3.5:9b'
        return httpx.Response(200,json={'done':True,'done_reason':'stop','message':{'thinking':'private','content':'{"search_terms":[],"read_source_ids":[]}'}})
    monkeypatch.setattr(model.httpx,'AsyncClient',lambda **kw:original(transport=httpx.MockTransport(serve)))
    assert asyncio.run(model.structured('test',{},Plan))==Plan()


def test_free_cloud_never_calls_paid_or_missing_model(monkeypatch):
    monkeypatch.setenv('CONSUMER_MODEL_PROVIDER','openrouter_free')
    monkeypatch.setenv('OPENROUTER_API_KEY','test-only')
    original=httpx.AsyncClient
    calls=[]
    def serve(request):
        calls.append(request.method)
        return httpx.Response(200,json={'data':[{'id':'qwen/qwen3.8-27b:free','pricing':{'prompt':'0.1','completion':'0'}}]})
    monkeypatch.setattr(model.httpx,'AsyncClient',lambda **kw:original(transport=httpx.MockTransport(serve)))
    with pytest.raises(ValueError):asyncio.run(model.structured('test',{},Plan))
    assert calls==['GET']


def test_short_prompt_ids_restore_original_evidence_ids_without_changing_quotes(monkeypatch):
    from app.services.consumer_agent import Findings
    monkeypatch.setenv('CONSUMER_MODEL_PROVIDER','ollama')
    original=httpx.AsyncClient
    def serve(request):
        body=json.loads(request.content)
        sent=json.loads(body['messages'][1]['content'])
        assert sent['sources'][0]['id']=='E1'
        assert sent['sources'][0]['quote_options'][0]['text']=='E1 是原文中的编号'
        assert 'citation_id' in body['format']['$defs']['Citation']['properties']
        final={'findings':[{'indicator_id':'identity','explanation':'材料提及主体，具体门店仍须核实。',
            'question':'具体门店是否属于这个经营主体？','citations':[{'citation_id':'E1Q0'}]}]}
        return httpx.Response(200,json={'done':True,'message':{'content':json.dumps(final,ensure_ascii=False)}})
    monkeypatch.setattr(model.httpx,'AsyncClient',lambda **kw:original(transport=httpx.MockTransport(serve)))
    result=asyncio.run(model.structured('test',{'sources':[{'id':'original-stable-hash','excerpt':'E1 是原文中的编号'}]},Findings,reasoning=False))
    assert result.findings[0].citations[0].source_id=='original-stable-hash'
    assert result.findings[0].citations[0].quote=='E1 是原文中的编号'


def test_quote_selection_rejects_unknown_sources_and_out_of_range_indices():
    text='原文内容'*30+'结尾'
    assert ''.join(model.quote_options(text))==text
    assert len(model.quote_options(text))==1
    with pytest.raises(ValueError):model.restore_quotes({'source_id':'E9','quote_index':0},{'E1':['真实原文']})
    with pytest.raises(ValueError):model.restore_quotes({'source_id':'E1','quote_index':3},{'E1':['真实原文']})
    assert model.restore_quotes({'citation_id':'E1Q0'},{'E1':['真实原文']})=={'source_id':'E1','quote':'真实原文'}
    with pytest.raises(ValueError):model.restore_quotes({'citation_id':'E1Q9'},{'E1':['真实原文']})


def test_partial_invalid_reasons_are_discarded_without_inventing_evidence():
    a=row(status='page_text');d=draft('medium',[a])
    bad=d.reasons[0].model_copy(deep=True);bad.citations[0].quote='并不存在的原始内容'
    d.reasons.append(bad)
    result=risk.assess(d,[a],NAME,'model',1,discard_invalid=True)
    assert len(result.reasons)==1 and result.level=='medium' and result.confidence=='low'
    assert result.decision_basis=='company_evidence'
    empty=risk.assess(RiskDraft(level='low',explanation='未找到足够的来源依据。',reasons=[]),[],NAME,'model',0)
    assert empty.level=='undetermined' and empty.decision_level=='medium' and empty.decision_basis=='information_gap'


def test_reduce_quotes_never_concatenate_disjoint_passages(monkeypatch):
    monkeypatch.setenv('CONSUMER_MODEL_PROVIDER','ollama');original=httpx.AsyncClient
    def serve(request):
        data=json.loads(request.content);sources=json.loads(data['messages'][1]['content'])['sources']
        assert [p['text'] for p in sources[0]['quote_options']]==['第一段原始文字','另一段原始文字']
        return httpx.Response(200,json={'done':True,'message':{'content':json.dumps({'level':'medium','explanation':'当前资料还需要进行核实。','reasons':[{'direction':'context','explanation':'该材料包含需要核实的线索。','citations':[{'citation_id':'E1Q1'}]}]},ensure_ascii=False)}})
    monkeypatch.setattr(model.httpx,'AsyncClient',lambda **kw:original(transport=httpx.MockTransport(serve)))
    result=asyncio.run(model.structured('test',{'sources':[{'id':'original','quote_passages':['第一段原始文字','另一段原始文字']}]},RiskDraft))
    assert result.reasons[0].citations[0].quote=='另一段原始文字'


def test_review_schema_requires_each_source_and_restores_original_identity(monkeypatch):
    from app.services.consumer_agent import Findings
    monkeypatch.setenv('CONSUMER_MODEL_PROVIDER','ollama');original=httpx.AsyncClient
    def serve(request):
        data=json.loads(request.content);reviews=data['format']['properties']['reviews']
        assert reviews['required']==['E2','E3']
        assert reviews['properties']['E2']['properties']['citation_id']['enum']==['E2Q0']
        values={ident:{'citation_id':ident+'Q0','kind':'customer_feedback','sentiment':'negative','summary':'顾客提出需要核对的问题。'} for ident in reviews['required']}
        return httpx.Response(200,json={'done':True,'message':{'content':json.dumps({'findings':[],'reviews':values,'cashflow_facts':[]},ensure_ascii=False)}})
    monkeypatch.setattr(model.httpx,'AsyncClient',lambda **kw:original(transport=httpx.MockTransport(serve)))
    result=asyncio.run(model.structured('test',{'sources':[{'id':'company','excerpt':'企业公开资料'},{'id':'review-one','excerpt':'第一份用户评价','review_required':True},{'id':'review-two','excerpt':'另一份用户评价','review_required':True}]},Findings))
    assert [r.source_id for r in result.reviews]==['review-one','review-two']


def test_old_complaints_and_aggregate_pages_do_not_establish_current_company_events():
    a=row(status='page_text');a.published_at='2021-09-15'
    with pytest.raises(ValueError,match='historical_event'):risk.assess(draft('medium',[a]),[a],NAME,'model',1)
    a.published_at=None;a.url='https://www.toutiao.com/topic/123/'
    with pytest.raises(ValueError,match='aggregation'):risk.assess(draft('medium',[a]),[a],NAME,'model',1)


def test_copyright_cannot_support_simulation_or_cashflow_claim():
    a=row(text='官网版权及品牌宣传',status='page_text');d=draft('medium',[a],'context')
    d.reasons[0].explanation='压力情景显示可能存在资金链风险。'
    with pytest.raises(ValueError,match='financial_conclusion'):risk.assess(d,[a],NAME,'model',1)


@pytest.mark.parametrize('claim', ['经营情况稳定', '主体持续运营', '法律履约能力尚可'])
def test_promotion_and_court_victory_cannot_establish_operating_strength(claim):
    a=row(text='拥有500万用户，曾在合同纠纷中获赔',status='page_text')
    d=draft('low',[a],'reassuring');d.reasons[0].explanation=claim
    with pytest.raises(ValueError,match='operating_conclusion'):
        risk.assess(d,[a],NAME,'model',1)
    result=risk.assess(d,[a],NAME,'model',1,discard_invalid=True)
    assert result.decision_level=='medium' and result.confidence=='low'
    assert not result.reasons


def test_undetermined_summary_does_not_keep_model_claim_of_safety():
    a=row(text='公司宣传材料',status='search_excerpt');d=draft('low',[a],'context')
    d.explanation='当前资料确认公司经营稳定。'
    result=risk.assess(d,[a],NAME,'model',1)
    assert result.level=='undetermined' and '经营稳定' not in result.explanation


def test_coverage_counts_websites_instead_of_varying_publisher_labels():
    from app.services.consumer_indicators import build
    from app.schemas.consumer import IdentityCandidate
    a=row('news.example.com');b=row('www.example.com')
    a.publisher='新闻署名';b.publisher='企业署名'
    identity=IdentityCandidate(id='c',name=NAME,basis='来源提及',source_ids=[a.id])
    coverage=next(i for i in build(identity,[a,b],[],[]) if i.id=='coverage')
    assert coverage.value=='2 条来源 · 1 个站点'


def test_sogou_uses_disclosed_destination_and_keeps_review_and_date_metadata():
    page='<h3 class="vr-title"><a href="/link?url=opaque">消费者反馈</a></h3><div class="fz-mid space-txt">测试服务有限公司退款说明</div><span>2025-05-02</span><div data-url="https://tousu.sina.com.cn/complaint/view/123/"></div>'
    rows=web.parse_sogou(page,'测试')
    assert len(rows)==1 and rows[0].channel=='community' and rows[0].published_at=='2025-05-02'
    assert rows[0].url=='https://tousu.sina.com.cn/complaint/view/123/'
    assert not web.parse_sogou(page.replace('data-url=','hidden-url='),'测试')
