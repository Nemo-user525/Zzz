from datetime import date
import pytest
from app.schemas.consumer import ReviewObservation, CashflowFact
from app.services import consumer_outlook as outlook, consumer_search as web, consumer_risk as risk
from app.services.consumer_agent import RiskDraft

NAME='测试服务有限公司'


def test_citations_restore_only_whitespace_and_never_splice_separate_phrases():
    original='开发者： 测试服务有限公司 V 7.4。运营者： 测试服务有限公司。'
    assert web.ground_quote('开发者：测试服务有限公司V 7.4',original)=='开发者： 测试服务有限公司 V 7.4'
    with pytest.raises(ValueError):web.ground_quote('运营者：测试服务有限公司V 7.4',original)


def source(text,host='news.example',scope='selected_entity'):
    row=web.make_source(NAME,'https://'+host+'/record',NAME+text,'测试')
    row.verification_status='page_text';row.scope=scope
    return row


def observation(row,sentiment='negative'):
    return ReviewObservation(source_id=row.id,kind='customer_feedback',sentiment=sentiment,
        summary='顾客反馈涉及服务体验，需核实处理后续。',quote=row.excerpt)


def test_every_collected_review_including_brand_requires_a_grounded_observation():
    a=source('消费者投诉退款未处理')
    b=source('用户评价服务正常',host='weibo.com',scope='brand_context')
    with pytest.raises(ValueError):outlook.validate_reviews([observation(a)],[a,b])
    items=[observation(a),observation(b,'positive')]
    outlook.validate_reviews(items,[a,b])
    result=outlook.summarize_reviews(items,[a,b])
    assert result.reviewed_count==result.collected_count==2
    assert result.counts['negative']==result.counts['positive']==1
    assert result.observations[1]['scope']=='brand_context'
    items[0].quote='模型虚构的用户评价'
    with pytest.raises(ValueError):outlook.validate_reviews(items,[a,b])


def test_review_reprints_are_visible_but_not_double_counted():
    a=source('消费者投诉退款未处理')
    b=source('消费者投诉退款未处理','other.example')
    result=outlook.summarize_reviews([observation(a),observation(b)],[a,b])
    assert result.reviewed_count==2 and result.independent_content_count==1
    assert result.counts['negative']==1 and result.observations[1]['duplicate_of']==a.id


def test_expansion_news_is_not_customer_feedback_but_actual_experiences_remain():
    a=source('2015年成立于杭州，迄今已经开出1300家门店，在行业背景下迅速崛起。','weibo.com')
    b=source('品牌成立于2015年，我办卡后退款未处理，已投诉。','douban.com')
    items=outlook.validate_reviews([observation(a,'positive'),observation(b)],[a,b])
    result=outlook.summarize_reviews(items,[a,b])
    assert result.reviewed_count==2 and result.counts['positive']==0 and result.counts['negative']==1
    assert result.observations[0]['kind']=='non_review' and result.observations[0]['quote']==a.excerpt


def test_app_promotion_cannot_support_overall_customer_sentiment():
    a=source('下载健身APP即可预约健身课程，拥有私人定制方案。')
    draft=RiskDraft(level='low',explanation='评价仍需核对。',reasons=[{
        'explanation':'收集的评价样本整体反馈中性偏正面。','direction':'reassuring',
        'citations':[{'source_id':a.id,'quote':a.excerpt}]}])
    with pytest.raises(ValueError,match='review_conclusion'):
        risk.assess(draft,[a],NAME,'test',1)


@pytest.mark.parametrize('text', ['领取三天免费健身体验卡，团操课任选，门店通用！', '品牌电影联名奖牌上线啦！'])
def test_marketing_offer_is_not_positive_customer_feedback(text):
    a=source(text,'weibo.com');item=observation(a,'positive')
    result=outlook.summarize_reviews(outlook.validate_reviews([item],[a]),[a])
    assert result.counts['positive']==0 and result.observations[0]['kind']=='non_review'


def test_no_financial_records_means_index_sensitivity_not_fictional_yuan():
    result=outlook.simulate([],[],NAME)
    assert result.mode=='sensitivity_only' and '非企业实际金额' in result.unit
    base=result.scenarios[0]
    assert base['cumulative_net_min']==-120 and base['cumulative_net_max']==120
    assert len(base['months'])==6
    stress=result.scenarios[1]
    assert stress['months'][-1]['inflow']==80
    assert stress['months'][-1]['outflow_max']==132


def financial_rows():
    year=str(date.today().year-1)
    row=source(f'{year}年经营活动现金流入小计240000元，经营活动现金流出小计120000元。')
    facts=[CashflowFact(kind=kind,amount_text=amount,unit='元',period=year,citation={'source_id':row.id,'quote':row.excerpt})
        for kind,amount in [('operating_inflow','240000'),('operating_outflow','120000')]]
    return row,facts


def test_same_period_cash_totals_anchor_monthly_arithmetic_and_keep_citations():
    row,facts=financial_rows()
    result=outlook.simulate(facts,[row],NAME)
    assert result.mode=='evidence_anchored'
    assert result.baseline['monthly_inflow']==20000 and result.baseline['monthly_outflow_min']==10000
    assert result.scenarios[0]['cumulative_net_min']==60000
    assert result.facts[0].citation.source_id==row.id


def test_revenue_unsupported_units_brand_scope_and_conflicting_totals_do_not_anchor_cash():
    row,facts=financial_rows()
    row.excerpt=row.excerpt.replace('经营活动现金流入小计','营业收入')
    for f in facts:f.citation.quote=row.excerpt
    assert outlook.simulate(facts,[row],NAME).mode=='sensitivity_only'
    row,facts=financial_rows();facts[0].amount_text='24000'
    assert outlook.simulate(facts,[row],NAME).mode=='sensitivity_only'
    row,facts=financial_rows();row.scope='brand_context'
    with pytest.raises(ValueError):outlook.simulate(facts,[row],NAME)
    row,facts=financial_rows()
    other=source(row.excerpt.replace('120000','130000'),'other.example')
    conflict=facts[1].model_copy(update={'amount_text':'130000','citation':facts[1].citation.model_copy(update={'source_id':other.id,'quote':other.excerpt})})
    assert outlook.simulate(facts+[conflict],[row,other],NAME).mode=='sensitivity_only'


def test_confidence_is_capped_by_evidence_even_if_model_claims_high():
    row=source('消费者投诉退款未处理')
    draft=RiskDraft(level='medium',explanation='退款投诉需要核实处理后续。',confidence='high',
        reasons=[{'explanation':'消费者退款问题仍待核对。','direction':'adverse','citations':[{'source_id':row.id,'quote':row.excerpt}]}])
    result=risk.assess(draft,[row],NAME,'test',1)
    assert result.level=='medium' and result.confidence=='low'
    assert '不是准确率' in result.confidence_explanation


def test_copyright_citation_cannot_prove_legal_registration_status():
    row=source('版权所有，欢迎访问官方网站')
    draft=RiskDraft(level='low',explanation='仅有网站署名，仍需核实状态。',
        reasons=[{'explanation':'官网署名确认公司合法存续。','direction':'reassuring','citations':[{'source_id':row.id,'quote':row.excerpt}]}])
    with pytest.raises(ValueError):risk.assess(draft,[row],NAME,'test',1)


def test_brand_feedback_can_explain_uncertainty_but_cannot_support_company_adverse_grade():
    row=source('用户评价要求核实退款后续',scope='brand_context')
    draft=RiskDraft(level='medium',explanation='品牌评价涉及退款，归属尚未核实。',
        reasons=[{'explanation':'该评价暂不能归属所选公司。','direction':'context','citations':[{'source_id':row.id,'quote':row.excerpt}]}])
    result=risk.assess(draft,[row],NAME,'test',0)
    assert result.level=='undetermined'
    draft.reasons[0].direction='adverse'
    with pytest.raises(ValueError):risk.assess(draft,[row],NAME,'test',0)
