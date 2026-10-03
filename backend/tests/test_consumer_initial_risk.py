"""Initial judgments use substantive retrieved content without claiming verification."""
import asyncio
import pytest
from app.services import consumer_risk as risk, consumer_agent as agent, consumer_model, consumer_search as web
from app.schemas.consumer import ReviewAssessment, CashflowAssessment

NAME = '长期服务股份有限公司'


def source(host, content, **updates):
    row = web.make_source(NAME, f'https://{host}/report', NAME + content, '经营正向材料')
    return row.model_copy(update=updates)


def positives():
    return [source('annual.example', '年报披露连续五年盈利，2025年净利润为120亿元。'),
            source('regulator.example', '2026年报告资本充足率达到18.2%，高于监管要求；全部网点正常提供服务。')]


def draft(rows, level='low', direction='reassuring'):
    return agent.RiskDraft(level=level, explanation='根据现有资料中的经营表现作出初步判断。',
        reasons=[{'direction': direction, 'explanation': '这份公开材料提供本次判断所需的具体依据。',
                  'citations': [{'source_id': row.id, 'quote': row.excerpt}]} for row in rows])


def test_sustained_substantive_search_excerpts_can_establish_initial_low_risk():
    rows = positives()
    result = risk.assess(draft(rows), rows, NAME, 'model', 2)
    assert result.level == result.decision_level == 'low'
    assert result.label == result.decision_label == '低风险'
    assert result.decision_basis == 'company_evidence'
    assert all(s.verification_status == 'search_excerpt' for s in rows)
    assert result.limitations == [risk.BOUNDARY]
    assert '待核实' not in result.explanation and '暂不评级' not in result.label


def test_fallback_and_model_abstention_use_same_positive_evidence():
    rows = positives()
    fallback = risk.fallback(rows, NAME)
    result = risk.assess(agent.RiskDraft(level='undetermined', explanation='当前只有搜索材料。', reasons=[]), rows, NAME, 'model', 2)
    assert result.level == fallback.level == 'low'
    assert not fallback.model_assessed and fallback.reasons
    assert {c.source_id for r in fallback.reasons for c in r.citations} == {s.id for s in rows}


def test_current_contrary_evidence_blocks_low_even_if_model_omits_it():
    rows = positives()
    negative = source('customers.example', '近日多家门店停业，消费者退款尚未履行。')
    result = risk.assess(draft(rows), rows + [negative], NAME, 'model', 3)
    assert result.decision_level == 'medium'
    assert risk.fallback(rows + [negative], NAME).level == 'medium'


def test_fallback_reports_specific_negative_evidence_with_action():
    rows = [source('news.example', '本月公司发布停业通知，原门店终止服务。'),
            source('customers.example', '会员投诉无法退款，客服表示余额暂时无法兑付。')]
    result = risk.fallback(rows, NAME)
    assert result.level == 'high' and result.decision_basis == 'company_evidence'
    assert '暂缓' in result.decision_explanation
    assert all(r.direction == 'adverse' for r in result.reasons)


@pytest.mark.parametrize('contents', [
    ['知名品牌，实力雄厚，值得信赖。', '拥有500万用户，愿景是持续盈利。'],
    ['预计连续五年盈利，目标净利润为120亿元。', '计划资本充足率达到18.2%。'],
    ['并未实现连续五年盈利，净利润下降12%。', '营业收入下滑10%，为负增长。'],
])
def test_slogans_forecasts_and_negative_metrics_are_not_positive_evidence(contents):
    rows = [source(f'{index}.example', text) for index, text in enumerate(contents)]
    assert risk.assess(draft(rows), rows, NAME, 'model', len(rows)).level == 'medium'
    assert risk.fallback(rows, NAME).level == 'medium'


def test_reprints_and_stale_positives_do_not_make_low_risk():
    rows = positives()
    copy = rows[0].model_copy(update={'id': 'reprint', 'url': 'https://copy.example/report'})
    assert risk.fallback([rows[0], copy], NAME).level == 'medium'
    assert risk.fallback([s.model_copy(update={'published_at': '2020-01-01'}) for s in rows], NAME).level == 'medium'


def test_stale_adverse_and_denied_events_do_not_block_current_positive_evidence():
    rows = positives()
    history = source('old.example', '2020年门店停业。', published_at='2020-01-01')
    denial = source('notice.example', '公司澄清并未停业，经营异常记录为零。')
    assert risk.fallback(rows + [history, denial], NAME).level == 'low'


def test_missing_offentity_or_navigation_material_never_creates_company_low_or_high():
    unrelated = source('other.example', '连续五年盈利，净利润120亿元。', scope='brand_context')
    for rows in ([], [unrelated]):
        result = risk.fallback(rows, NAME)
        assert result.level == 'undetermined' and result.decision_level == 'medium'
        assert result.decision_basis == 'information_gap'
        assert '不表示公司存在不良经营事件' in result.explanation
    unrelated.scope = 'selected_entity'
    unrelated.title = '其他公司'
    unrelated.excerpt = '其他公司连续五年盈利，净利润120亿元。'
    with pytest.raises(ValueError, match='unsupported'):
        risk.assess(draft([unrelated]), [unrelated], NAME, 'model', 1)


def test_unavailable_model_returns_grounded_initial_judgment(monkeypatch):
    rows = positives()
    state = {'sources': rows, 'identity': {'name': NAME}, 'trace': [], 'model_calls': 0,
             'reviews': ReviewAssessment(), 'cashflow': CashflowAssessment()}
    monkeypatch.setattr(consumer_model, 'effective_mode', lambda: 'offline')
    result = asyncio.run(agent.synthesize(state))
    assert result['risk'].level == 'low' and not result['risk'].model_assessed


def test_search_excerpt_can_support_literal_operating_statement():
    rows = positives()
    rows[0].excerpt += '目前持续运营。'
    item = draft(rows)
    item.reasons[0].explanation = '资料明确记载该公司持续运营。'
    item.reasons[0].citations[0].quote = rows[0].excerpt
    assert risk.assess(item, rows, NAME, 'model', 2).level == 'low'


def test_fallback_bounds_long_provider_quotes_and_drops_empty_excerpts():
    rows = positives()
    rows[0].excerpt += '具体年度经营资料。' * 100
    result = risk.fallback(rows, NAME)
    assert result.level == 'low'
    assert all(len(c.quote) <= 480 and c.quote in next(s.excerpt for s in rows if s.id == c.source_id)
               for reason in result.reasons for c in reason.citations)
    blank = rows[0].model_copy(update={'excerpt': ''})
    assert risk.fallback([blank], NAME).level == 'undetermined'
