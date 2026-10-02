"""Cited model assessment with conservative evidence gates, never a probability."""
import re
from difflib import SequenceMatcher
from datetime import date
from app.schemas.consumer import RiskAssessment, ReviewAssessment, CashflowAssessment
from app.services import consumer_search as web, consumer_outlook

LABELS = {'low': '较低风险', 'medium': '中等风险 · 需核实', 'high': '较高风险', 'undetermined': '证据不足，暂不评级'}


def independent_count(rows):
    retained, sites = [], set()
    for source in rows:
        site = web.publisher_key(source.url)
        text = re.sub(r'\W+', '', source.excerpt)
        if site in sites or any(SequenceMatcher(None, text, old).ratio() >= .85 for old in retained):
            continue
        sites.add(site)
        retained.append(text)
    return len(retained)


def validate_reason(reason, all_sources, sources):
    for citation in reason.citations:
        source = all_sources.get(citation.source_id)
        if not source or (source.scope=='brand_context' and reason.direction!='context') or (source.scope=='selected_entity' and source.id not in sources):
            raise ValueError('unsupported_risk_citation')
        citation.quote = web.ground_quote(citation.quote, source.excerpt)
        if web.navigation_excerpt(citation.quote):
            raise ValueError('navigation_is_not_evidence')
        if web.aggregation_page(source.url):
            raise ValueError('aggregation_does_not_establish_entity')
    if re.search(r'存续|合法经营',reason.explanation) and not any(
        all_sources[c.source_id].channel in {'registry','government'} and re.search('存续|在业',c.quote) for c in reason.citations):
        raise ValueError('unsupported_registration_conclusion')
    if re.search(r'现金流|收支差额|资金链|流动性|资金短缺|资金压力',reason.explanation) and not any(
        re.search(r'现金流|收支|资金链|流动性|资金短缺|资金压力',c.quote) for c in reason.citations):
        raise ValueError('unsupported_financial_conclusion')
    operating_claim = r'经营(?:情况)?稳定|持续运营|正常运营|履约能力(?:尚可|良好|较强|可靠)'
    if re.search(operating_claim, reason.explanation) and not any(
        all_sources[c.source_id].verification_status != 'search_excerpt' and
        re.search(operating_claim, c.quote) for c in reason.citations):
        raise ValueError('unsupported_operating_conclusion')
    if reason.direction=='adverse':
        def stale(citation):
            value=all_sources[citation.source_id].published_at
            try:return bool(value) and (date.today()-date.fromisoformat(value[:10])).days>730
            except ValueError:return False
        if all(stale(c) for c in reason.citations):
            raise ValueError('historical_event_needs_current_followup')
    return reason


def assess(draft, rows, name, model, reviewed_count, reviews=None, cashflow=None, *, discard_invalid=False):
    reviews = reviews or ReviewAssessment()
    cashflow = cashflow or CashflowAssessment()
    all_sources = {s.id:s for s in rows}
    sources = {s.id: s for s in rows if s.scope == 'selected_entity' and web.relevant(s, name)}
    valid, rejected = [], 0
    for reason in draft.reasons:
        try:
            valid.append(validate_reason(reason, all_sources, sources))
        except ValueError:
            if not discard_invalid:raise
            rejected += 1
    draft = draft.model_copy(update={'reasons':valid})
    if rejected:
        draft.confidence = 'low'
        draft.confidence_explanation = '部分综合理由缺少直接证据支持，已删除，剩余材料的支持度有限。'
        draft.explanation = '部分模型理由未通过来源核对，已整项删除；评级只采用下方保留的证据。'
        draft.review_impact = '评价阅读结果保留在下方；引用不合格的综合结论已删除。'
        draft.cashflow_impact = '收支情景保留在下方；假设情景不用于认定公司资金短缺。'
    cited = {c.source_id for r in draft.reasons for c in r.citations}
    supporting = [sources[i] for i in cited if i in sources]
    adverse = [sources[c.source_id] for r in draft.reasons if r.direction == 'adverse' for c in r.citations]
    level, limits = draft.level, []
    if level != 'undetermined' and not supporting:
        level = 'undetermined'
        limits.append('评级没有可追溯依据。')
    if level in {'medium', 'high'} and not adverse:
        level = 'undetermined'
        limits.append('风险等级缺少具体不利材料，资料缺失不构成风险事件。')
    if level == 'high' and (independent_count(adverse) < 2 or
                           not any(s.verification_status != 'search_excerpt' for s in adverse)):
        level = 'medium'
        limits.append('不利线索尚缺不同网站与正文/接口交叉支持，不能定为较高风险。')
    brand_concerns = any(s.scope == 'brand_context' and web.signal_matches(s, '停业|闭店|欠薪|退款|退费|投诉') for s in rows)
    if level == 'low' and (independent_count(supporting) < 3 or
                          sum(s.verification_status != 'search_excerpt' for s in supporting) < 2 or
                          len({s.channel for s in supporting}) < 2 or adverse or brand_concerns or
                          any(web.signal_matches(s, '停业|闭店|欠薪|无法退款|拒绝退款|经营异常') for s in sources.values())):
        level = 'undetermined'
        limits.append('较低风险需要多渠道的具体正向依据及正文核对，不能由“未搜到负面”推出。')
        if brand_concerns:
            limits.append('品牌背景中仍有投诉或服务变化线索，主体关联未核清，不能据此宣称较低风险。')
    confidence = consumer_outlook.confidence(draft, rows, level, reviews, cashflow)
    decision = {} if level == 'undetermined' else dict(decision_level=level,
        decision_label={'low':'较低决策风险 · 仍需核对合同','medium':'中等决策风险 · 核实后再预付','high':'较高决策风险 · 建议暂缓预付'}[level],
        decision_basis='company_evidence', decision_explanation='依据下方企业材料与模型评估给出预付建议；具体门店归属和合同仍需核对。')
    if rejected:limits.append(f'已删除 {rejected} 项引用未通过的模型理由，确信度限制为低。')
    explanation = ('现有材料不足以确认企业当前风险高低；已保留下方可追溯线索及评价、收支情景。预付决策按信息缺口采用谨慎等级。'
                   if level == 'undetermined' else draft.explanation)
    return RiskAssessment(level=level, label=LABELS[level], explanation=explanation, **decision,
        reasons=draft.reasons, model=model, model_assessed=True, reviewed_source_count=reviewed_count,
        **confidence, review_impact=draft.review_impact, cashflow_impact=draft.cashflow_impact,
        limitations=limits + ['这是基于本次公开材料的 AI 初判，不是安全保证或违约概率。',
            '评级仅针对所选公司；具体门店、加盟商归属和事件后续仍需核对。'])
