import asyncio

from app.schemas.consumer import AnalysisInput, Step
from app.services import consumer, consumer_agent as agent, consumer_search as web


def test_store_investigation_keeps_location_and_skips_company_lookup(monkeypatch):
    saved = {}
    monkeypatch.setattr(consumer.cache, 'save', lambda value: saved.update({value.investigation_id: value}))
    monkeypatch.setattr(consumer.cache, 'get', lambda ident: saved.get(ident))
    monkeypatch.setenv('LLM_PROVIDER', 'offline')
    monkeypatch.setenv('CONSUMER_MODEL_PROVIDER', 'offline')
    monkeypatch.setattr(agent.criteria, 'reference', lambda text: {'status': 'not_trained', 'sample_count': 0, 'matches': [], 'limitation': '无参考'})
    seen = []

    async def search(query, purpose):
        seen.append((query, purpose))
        row = web.make_source('测试健身房用户评价', 'https://www.dianping.com/review/test',
            '测试健身房 西湖区 用户评价：本人办卡后无法退款，仍在处理。', purpose)
        return [row], Step(action=purpose, status='completed', detail=query)

    async def read(row):
        return ''

    async def no_registry(*args, **kwargs):
        raise AssertionError('store review investigation must not look up an invented company')

    monkeypatch.setattr(web, 'search', search)
    monkeypatch.setattr(web, 'read_page', read)
    monkeypatch.setattr(agent, 'lookup', no_registry)
    discovery = consumer.store_review_discovery({'id': 'poi', 'name': '测试健身房', 'city': '杭州', 'district': '西湖区', 'address': '文一路10号'})
    identity = discovery.candidates[0]
    assert identity.research_scope == 'store_reviews'
    assert identity.place['address'] == '文一路10号'
    report = asyncio.run(consumer.analysis(AnalysisInput(investigation_id=discovery.investigation_id, candidate_id=identity.id)))
    assert all('杭州 西湖区 文一路10号' in query for query, _ in seen)
    assert {'大众点评', '用户口碑', '小红书线索', '消费者投诉'} <= {purpose for _, purpose in seen}
    assert report.identity.research_scope == 'store_reviews'
    assert not report.risk.model_assessed
    assert report.risk.level == 'undetermined'
    assert any('不是企业工商或财务评级' in text for text in report.risk.limitations)


def test_reviews_of_other_locations_and_marketing_are_background():
    identity = {'name': '测试健身房', 'place': {'address': '文一路10号', 'district': '西湖区'}}
    rows = [web.make_source('测试健身房用户评价', f'https://example.com/{i}', text, '用户口碑') for i, text in enumerate([
        '测试健身房 西湖区 文一路10号 本人购买课包无法退款。',
        '测试健身房 滨江区 本人购买课包无法退款。',
    ])]
    scoped = agent.scope_store_sources(rows, identity)
    assert scoped[0].scope == 'selected_entity'
    assert scoped[1].scope == 'brand_context'
    marketing = web.make_source('测试健身房官网', 'https://example.com/brand', '测试健身房 西湖区 成立多年，融资扩张。', '企业官网')
    assert agent.scope_store_sources([marketing], identity)[0].scope == 'brand_context'


def test_model_reviews_all_materials_and_rates_store_without_marketing_evidence(monkeypatch):
    from app.schemas.consumer import ReviewObservation, ReviewAssessment, CashflowAssessment, RiskReason, Citation
    from app.services import consumer_model
    name = '测试健身房（文一路店）'
    rows = [web.make_source(name + '用户评价', url, name + text, '用户口碑') for url, text in [
        ('https://www.dianping.com/review/a', ' 本人办卡后门店停业，至今无法退款。'),
        ('https://tousu.sina.com.cn/complaint/a', ' 本人课包无法退款，门店停业后客服不回应。'),
        ('https://brand.example/promo', ' 宣传：注册资本100万元，扩张迅速。'),
    ]]
    for row in rows:
        row.verification_status = 'page_text'
    monkeypatch.setattr(consumer_model, 'effective_mode', lambda: 'openrouter')
    monkeypatch.setattr(consumer_model, 'model_name', lambda: 'test-model')
    seen = []

    async def structured(instruction, data, schema, **kwargs):
        seen.append(data)
        if schema == agent.Findings:
            return agent.Findings(findings=[], reviews=[ReviewObservation(source_id=s.id,
                kind='customer_feedback' if index < 2 else 'non_review', sentiment='negative' if index < 2 else 'unclear',
                summary='顾客称停业后退款尚未解决。' if index < 2 else '这是品牌宣传材料，不是顾客反馈。', quote=s.excerpt)
                for index, s in enumerate(rows)])
        return agent.RiskDraft(level='high', explanation='不同网站顾客反馈停业与退款问题，需要暂缓预付。',
            reasons=[RiskReason(explanation='顾客称门店停业，退款仍未解决。', direction='adverse',
                citations=[Citation(source_id=s.id, quote=s.excerpt)]) for s in rows[:2]])

    monkeypatch.setattr(consumer_model, 'structured', structured)
    state = {'identity': {'name': name, 'research_scope': 'store_reviews'}, 'context': {}, 'criteria': {},
        'executed_queries': [], 'sources': rows, 'trace': [], 'model_calls': 0}
    result = asyncio.run(agent.synthesize(state))
    assert result['reviews'].status == 'completed'
    assert result['reviews'].reviewed_count == result['reviews'].collected_count == 3
    assert result['risk'].level == 'high'
    assert rows[2].scope == 'brand_context'
    assert seen[-1]['reviews']['counts']['negative'] == 2
    assert not any(c.source_id == rows[2].id for reason in result['risk'].reasons for c in reason.citations)
