"""Source-grounded initial judgments; source retrieval status is not a rating gate."""
import re
from difflib import SequenceMatcher
from datetime import date
from types import SimpleNamespace
from app.schemas.consumer import RiskAssessment, RiskReason, ReviewAssessment, CashflowAssessment
from app.services import consumer_search as web, consumer_outlook

LABELS = {'low': '低风险', 'medium': '中风险', 'high': '高风险', 'undetermined': '中风险'}
BOUNDARY = '基于本次公开资料的初步判断。'
ADVERSE = r'停业|闭店|欠薪|拖欠工资|无法退款|拒绝退款|退款尚未履行|退款投诉|退费投诉|逾期未兑付|违约|经营异常|资金链断裂|破产清算'
SEVERE = r'停业|闭店|欠薪|拖欠工资|无法退款|拒绝退款|退款尚未履行|逾期未兑付|资金链断裂|破产清算'
NEGATED = r'(?:并未|并无|没有|不存在|未发生|未出现|否认|澄清|不涉及|无需|无)(?:[^，。；;]{0,8})$'
FORWARD = r'预计|有望|力争|计划|愿景|力求|争取|目标|如果|假设|是否|[？?]'


def independent_rows(rows):
    retained, sites, result = [], set(), []
    for source in rows:
        site = web.publisher_key(source.url)
        text = re.sub(r'\W+', '', source.excerpt)
        if site in sites or any(SequenceMatcher(None, text, old).ratio() >= .85 for old in retained):
            continue
        sites.add(site)
        retained.append(text)
        result.append(source)
    return result


def independent_count(rows):
    return len(independent_rows(rows))


def stale(source):
    try:
        return bool(source.published_at) and (date.today() - date.fromisoformat(source.published_at[:10])).days > 730
    except ValueError:
        return False


def has_adverse(text, pattern=ADVERSE):
    """A denial, hypothetical, or navigation label is not an adverse event."""
    text = re.sub(r'变更记录|行政处罚记录|行政处罚信息|经营异常记录', '', text)
    for sentence in re.split(r'[。；;\n]', text):
        if re.search(FORWARD, sentence):
            continue
        for match in re.finditer(pattern, sentence):
            if not re.search(NEGATED, sentence[:match.start()]):
                return True
    return False


def positive_weight(text):
    """Weight concrete disclosures, never a company name, slogans, or missing negatives."""
    weight = 0
    for sentence in re.split(r'[。；;\n]', text):
        if re.search(FORWARD + r'|未能|未实现|并未|没有|无法|不能|不再|尚未|亏损|下滑|下降|减少|缩水|为负|负增长|低于监管', sentence) or has_adverse(sentence):
            continue
        if re.search(r'(?:连续[一二三四五六七八九十\d]+年|多年|长期|持续)(?:[^，。；]{0,12})(?:盈利|净利润增长|稳定分红|正向现金流)', sentence):
            weight = max(weight, 2)
        amount = re.search(r'(?:净利润|经营活动现金流量净额)(?:[^，。；\d-]{0,12})(\d+(?:\.\d+)?)\s*(?:亿|万)', sentence)
        if amount and float(amount[1]) > 0:
            weight = max(weight, 2)
        if re.search(r'(?:资本充足率|流动性覆盖率)[^。；]{0,30}\d+(?:\.\d+)?\s*(?:%|％)', sentence) and re.search(r'高于监管|符合监管|达到监管|满足监管|达标', sentence):
            weight = max(weight, 2)
        if re.search(r'正常营业|正常提供(?:课程|服务)|正常运营|持续运营|经营(?:情况)?稳定|完成退款|退款完成|履行完毕|许可续期|登记为存续|完成年检', sentence):
            weight = max(weight, 1)
    return weight


def usable_sources(rows, name):
    return {s.id: s for s in rows if s.scope == 'selected_entity' and web.relevant(s, name)
            and len(s.excerpt.strip()) >= 4 and not web.navigation_excerpt(s.excerpt) and not web.aggregation_page(s.url)}


def validate_reason(reason, all_sources, sources):
    for citation in reason.citations:
        source = all_sources.get(citation.source_id)
        if not source or (source.scope == 'brand_context' and reason.direction != 'context') or (source.scope == 'selected_entity' and source.id not in sources):
            raise ValueError('unsupported_risk_citation')
        citation.quote = web.ground_quote(citation.quote, source.excerpt)
        if web.navigation_excerpt(citation.quote):
            raise ValueError('navigation_is_not_evidence')
        if web.aggregation_page(source.url):
            raise ValueError('aggregation_does_not_establish_entity')
    if re.search(r'存续|合法经营', reason.explanation) and not any(
        all_sources[c.source_id].channel in {'registry', 'government'} and re.search('存续|在业', c.quote) for c in reason.citations):
        raise ValueError('unsupported_registration_conclusion')
    if re.search(r'现金流|收支差额|资金链|流动性|资金短缺|资金压力', reason.explanation) and not any(
        re.search(r'现金流|收支|资金链|流动性|资金短缺|资金压力', c.quote) for c in reason.citations):
        raise ValueError('unsupported_financial_conclusion')
    operating_claim = r'经营(?:情况)?稳定|持续运营|正常运营|履约能力(?:尚可|良好|较强|可靠)'
    if re.search(operating_claim, reason.explanation) and not any(re.search(operating_claim, c.quote) for c in reason.citations):
        raise ValueError('unsupported_operating_conclusion')
    if reason.direction == 'adverse' and all(stale(all_sources[c.source_id]) for c in reason.citations):
        raise ValueError('historical_event_needs_current_followup')
    return reason


def fallback_reasons(rows, name):
    """Deterministic fallback quotes observations; it does not fabricate model analysis."""
    # Provider records may be longer than web snippets. Classify exactly the passage
    # we can quote, so a later signal never gets attributed to a truncated citation.
    sources = [s.model_copy(update={'excerpt': s.excerpt[:480]}) for s in usable_sources(rows, name).values()]
    ranked = sorted(sources, key=lambda s: (not stale(s), has_adverse(s.excerpt), positive_weight(s.excerpt)), reverse=True)
    result = []
    for source in independent_rows(ranked)[:6]:
        direction = 'context' if stale(source) else 'adverse' if has_adverse(source.excerpt) else 'reassuring' if positive_weight(source.excerpt) else 'context'
        explanation = {'adverse': '这份材料报告了具体不利情况，增加当前服务或交易风险。',
                       'reassuring': '这份材料包含经营或履约方面的具体正向信息，支持较低风险判断。',
                       'context': '这份材料提供企业背景，作为本次判断的参考。'}[direction]
        result.append(RiskReason(explanation=explanation, direction=direction,
                                 citations=[{'source_id': source.id, 'quote': source.excerpt}]))
    return result


def assess(draft, rows, name, model, reviewed_count, reviews=None, cashflow=None, *, discard_invalid=False):
    reviews = reviews or ReviewAssessment()
    cashflow = cashflow or CashflowAssessment()
    all_sources = {s.id: s for s in rows}
    # Keep all relevant sources here so invalid aggregate citations retain a useful error.
    sources = {s.id: s for s in rows if s.scope == 'selected_entity' and web.relevant(s, name)}
    valid, rejected = [], 0
    for reason in draft.reasons:
        try:
            if re.search(r'评价样本|收集的评价|整体反馈|评价.*倾向|口碑', reason.explanation):
                feedback = {o['source_id'] for o in reviews.observations if o['kind'] != 'non_review'}
                if not any(c.source_id in feedback for c in reason.citations):
                    raise ValueError('unsupported_review_conclusion')
            valid.append(validate_reason(reason, all_sources, sources))
        except ValueError:
            if not discard_invalid:
                raise
            rejected += 1
    # Models sometimes abstain despite having useful material. Use its actual content.
    if not valid and not rejected:
        valid = fallback_reasons(rows, name)
    draft = SimpleNamespace(**{key: getattr(draft, key) for key in ('level', 'explanation', 'confidence', 'confidence_explanation', 'review_impact', 'cashflow_impact')}, reasons=valid)
    if rejected:
        draft.confidence = 'low'
        draft.confidence_explanation = '部分综合理由缺少直接引文支持，判断仅采用保留的资料。'
    cited = {c.source_id for r in valid for c in r.citations}
    supporting = [sources[i] for i in cited if i in sources]
    adverse = [sources[c.source_id] for r in valid if r.direction == 'adverse' for c in r.citations if c.source_id in sources and not stale(sources[c.source_id])]
    positives = []
    for reason in valid:
        if reason.direction != 'reassuring':
            continue
        for citation in reason.citations:
            source = sources.get(citation.source_id)
            if source and not stale(source) and positive_weight(citation.quote):
                positives.append(source.model_copy(update={'excerpt': citation.quote}))
    independent_positive = independent_rows(sorted(positives, key=lambda s: positive_weight(s.excerpt), reverse=True))
    positive_support = len(independent_positive) >= 2 and sum(positive_weight(s.excerpt) for s in independent_positive) >= 3
    current_concerns = [s for s in sources.values() if not stale(s) and has_adverse(s.excerpt)]
    brand_concerns = any(s.scope == 'brand_context' and not stale(s) and has_adverse(s.excerpt) for s in rows)
    level, limits = draft.level, []
    if not supporting:
        level = 'undetermined'
    elif level in {'low', 'undetermined'}:
        if positive_support and not adverse and not current_concerns and not brand_concerns:
            level = 'low'
        elif adverse:
            level = 'high' if independent_count(adverse) >= 2 and all(has_adverse(s.excerpt, SEVERE) for s in adverse) else 'medium'
        else:
            level = 'medium'
    elif level == 'high' and independent_count(adverse) < 2:
        level = 'medium'
    if level == 'low':
        explanation = '现有资料中的具体正向经营或履约信息占优，初步判断为低风险。可以正常比较并考虑购买，优先选择可退出、期限适中的方案。'
    elif level == 'high':
        explanation = '不同来源指向具体且严重的履约问题，初步判断为高风险。建议暂缓新增预付或加大投入，优先处理已有合同与退款。'
    elif adverse:
        explanation = '现有资料包含具体不利情况，初步判断为中风险。建议控制金额与期限，优先按次或分阶段购买。'
    else:
        explanation = '按现有资料作出中风险的谨慎决策判断，建议小额、短期或按次购买；这是对当前决策条件的判断，不表示公司存在不良经营事件。'
    confidence = consumer_outlook.confidence(draft, rows, level, reviews, cashflow)
    if brand_concerns:
        limits.append('品牌层面的不利材料仅作为交易背景，不归为所选公司的事件。')
    if rejected:
        limits.append(f'已删除 {rejected} 项缺少直接引用支持的理由。')
    decision_level = level if level != 'undetermined' else 'medium'
    company_basis = bool(adverse or (level == 'low' and positive_support))
    return RiskAssessment(level=level, label=LABELS[level], explanation=explanation,
        decision_level=decision_level, decision_label=LABELS[decision_level],
        decision_basis='company_evidence' if company_basis else 'information_gap', decision_explanation=explanation,
        reasons=valid, model=model, model_assessed=True, reviewed_source_count=reviewed_count,
        **confidence, review_impact=draft.review_impact, cashflow_impact=draft.cashflow_impact,
        limitations=[BOUNDARY] + limits)


def fallback(rows, name, reviews=None, cashflow=None):
    reasons = fallback_reasons(rows, name)
    draft = SimpleNamespace(level='undetermined', explanation='根据已收集资料形成初步判断。', reasons=reasons,
        confidence='low', confidence_explanation='本次采用已收集材料中的明确表述形成初步判断。',
        review_impact='用户反馈按原始材料保留，正面与负面信息共同纳入判断。',
        cashflow_impact='财务资料仅按原始披露理解，情景假设不当作企业实际收支。')
    result = assess(draft, rows, name, '', 0, reviews, cashflow)
    return result.model_copy(update={'model_assessed': False})
