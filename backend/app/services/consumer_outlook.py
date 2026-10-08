"""Auditable review coverage and conditional cash-flow sensitivity, not forecasts."""
import calendar
import re
from datetime import date
from decimal import Decimal
from difflib import SequenceMatcher
from app.schemas.consumer import ReviewAssessment, CashflowAssessment
from app.services import consumer_search as web


def review_material(source):
    return source.channel == 'community' or source.purpose in {'用户口碑', '大众点评', '消费者投诉'} or web.signal_matches(source, '用户评价|用户反馈|消费者反映|消费者投诉|顾客评价|用户评论|会员投诉')


def validate_reviews(observations, rows):
    expected = {s.id: s for s in rows if review_material(s)}
    if len(observations) != len(expected) or {o.source_id for o in observations} != set(expected):
        raise ValueError('review_coverage_incomplete')
    for item in observations:
        item.quote = web.ground_quote(item.quote, expected[item.source_id].excerpt)
        corporate = re.search(r'成立于|注册资本|融资|开出.{0,12}家门店|迅速崛起|经营范围|股东', item.quote)
        marketing = re.search(r'宣传|营销|联名.{0,12}上线|领取.{0,16}免费|报名方式|扫.{0,8}二维码|有需要.{0,10}下载', item.quote+' '+item.summary)
        experience = re.search(r'本人|我(?:在|的|买|办|去|用|退)|消费者|顾客|投诉|退款|退费|体验(?:后|过|了)|客服|排队|都可以使用|服务态度', item.quote)
        if item.kind != 'non_review' and (corporate or marketing) and not experience:
            item.kind = 'non_review'
            item.sentiment = 'unclear'
            item.summary = '原文仅支持企业背景、扩张或营销信息，未包含可定位的顾客体验，不计入评价倾向。'
    return observations


def summarize_reviews(observations, rows, completed=True):
    sources = {s.id: s for s in rows}
    reviewed, unique = [], []
    counts = {key: 0 for key in ('positive', 'negative', 'mixed', 'unclear')}
    for observation in observations:
        source = sources[observation.source_id]
        text = re.sub(r'\W+', '', source.excerpt)
        duplicate = next((item['source_id'] for old, item in unique if SequenceMatcher(None, text, old).ratio() >= .85), None)
        item = observation.model_dump() | {'scope': source.scope, 'duplicate_of': duplicate, 'published_at': source.published_at}
        reviewed.append(item)
        if observation.kind != 'non_review' and duplicate is None:
            unique.append((text, item))
            counts[observation.sentiment] += 1
    return ReviewAssessment(status='completed' if completed else 'not_reviewed',
        collected_count=sum(review_material(s) for s in rows), reviewed_count=len(reviewed),
        independent_content_count=len(unique), counts=counts, observations=reviewed)


def validated_facts(facts, rows, name):
    """Only explicit, current, same-company gross operating cash totals can anchor money."""
    sources = {s.id: s for s in rows}
    valid = []
    for fact in facts:
        source = sources.get(fact.citation.source_id)
        quote = fact.citation.quote
        if not source or source.scope != 'selected_entity' or not web.relevant(source, name):
            raise ValueError('unsupported_cashflow_citation')
        quote = fact.citation.quote = web.ground_quote(quote, source.excerpt)
        if source.verification_status == 'search_excerpt' or web.navigation_excerpt(source.excerpt):
            continue
        year, *month = map(int, fact.period.split('-'))
        try:
            end = date(year, month[0] if month else 12, calendar.monthrange(year, month[0] if month else 12)[1])
        except ValueError:
            continue
        if not 0 <= (date.today()-end).days <= 550:
            continue
        # Revenue/profit/registered capital are not cash receipts or payments.
        direction = '流入' if fact.kind == 'operating_inflow' else '流出'
        if not re.search(r'经营活动.{0,12}现金'+direction+r'.{0,4}(?:小计|总额|合计)', quote):
            continue
        if not re.search(r'(?<![\d.,])'+re.escape(fact.amount_text)+r'\s*'+fact.unit+r'(?![\u4e00-\u9fff]*美元)', quote):
            continue
        if str(year)+'年' not in quote or (month and f'{month[0]}月' not in quote) or (not month and re.search('季度|半年|[1-9]月', quote)):
            continue
        value = Decimal(fact.amount_text.replace(',', ''))
        if not value.is_finite() or value < 0 or value > Decimal('1e15'):
            continue
        valid.append(fact)
    return valid


def simulate(facts, rows, name):
    facts = validated_facts(facts, rows, name)
    periods = {}
    for fact in facts:
        periods.setdefault(fact.period, {}).setdefault(fact.kind, []).append(fact)
    selected = None
    for period, values in sorted(periods.items(), reverse=True):
        if set(values) != {'operating_inflow', 'operating_outflow'}:
            continue
        def amounts(items):
            return {Decimal(i.amount_text.replace(',', '')) * {'元':1,'万元':10000,'亿元':100000000}[i.unit] for i in items}
        inflows, outflows = amounts(values['operating_inflow']), amounts(values['operating_outflow'])
        if len(inflows) == len(outflows) == 1:
            months = 1 if '-' in period else 12
            selected = (period, float(next(iter(inflows))/months), float(next(iter(outflows))/months))
            break  # Conflicting amounts never silently select a more convenient source.
    anchored = selected is not None
    period, inflow, outflow = selected if selected else ('未取得同期间经营收付款总额',100.,100.)
    costs = [outflow] if anchored else [80.,100.,120.]
    scenarios = []
    for label, income_delta, expense_delta in [('延续情景',0.,0.),('收款承压情景',-.20,.10),('经营缓解情景',.10,-.05)]:
        months, cumulative_min, cumulative_max = [], 0., 0.
        for month in range(1,7):
            receipts = inflow * (1+income_delta*month/6)
            payments = [cost*(1+expense_delta*month/6) for cost in costs]
            net_min, net_max = receipts-max(payments), receipts-min(payments)
            cumulative_min += net_min
            cumulative_max += net_max
            months.append({'month':month,'inflow':round(receipts,2),'outflow_min':round(min(payments),2),
                'outflow_max':round(max(payments),2),'net_min':round(net_min,2),'net_max':round(net_max,2)})
        scenarios.append({'name':label,'inflow_change_pct':round(income_delta*100),'outflow_change_pct':round(expense_delta*100),
            'assumption':'六个月内线性变化的试算假设，非模型预测增长率',
            'months':months,'cumulative_net_min':round(cumulative_min,2),'cumulative_net_max':round(cumulative_max,2)})
    drivers = [s.id for s in rows if s.scope == 'selected_entity' and web.signal_matches(s,'退款|退费|欠薪|租金|工资|营收|收入|成本|收款|现金流|停业|开业')]
    return CashflowAssessment(mode='evidence_anchored' if anchored else 'sensitivity_only',
        unit='元（历史经营收付款均值的条件推演）' if anchored else '基准月收款=100的指数，非企业实际金额',
        baseline={'period':period,'monthly_inflow':inflow,'monthly_outflow_min':min(costs),'monthly_outflow_max':max(costs),
            'description':'同期间经营现金流入/流出总额折算月均值' if anchored else '收入基线假设为100，同时测试支出80、100、120三档；企业实际利润率未知'},
        facts=facts,scenarios=scenarios,driver_source_ids=drivers,
        limitations=['变化比例为公开固定的压力测试参数，资料用于解释压力方向，不能把这些比例当成预测或用于凭空提高风险等级。',
            '未纳入未知的期初现金、融资、投资、债务到期和季节性，不能推算企业何时资金耗尽。',
            *([] if anchored else ['缺少可核对的同期间经营收付款总额，仅做条件敏感性试算，不输出虚构的企业未来金额。'])])


def confidence(draft, sources, level, reviews, cashflow):
    from app.services.consumer_risk import independent_count
    company = [s for s in sources if s.scope == 'selected_entity']
    cited_ids = {c.source_id for r in draft.reasons for c in r.citations}
    cited = [s for s in company if s.id in cited_ids]
    independent = independent_count(cited)
    bodies = sum(s.verification_status != 'search_excerpt' for s in cited)
    def recent(source):
        try:return bool(source.published_at) and 0 <= (date.today()-date.fromisoformat(source.published_at[:10])).days <= 365
        except ValueError:return False
    dated = sum(recent(s) for s in cited)
    unresolved = any(o['scope']=='brand_context' and o['sentiment'] in {'negative','mixed'} for o in reviews.observations)
    maximum = 'low' if level=='undetermined' or independent<2 or bodies<1 else 'medium'
    if maximum=='medium' and independent>=3 and bodies>=2 and dated>=2 and not unresolved and reviews.status=='completed' and cashflow.mode=='evidence_anchored' and any(s.channel in {'registry','government'} for s in cited):
        maximum='high'
    order={'low':0,'medium':1,'high':2}
    chosen=min((draft.confidence,maximum),key=order.get)
    explanation=(draft.confidence_explanation+'；' if draft.confidence_explanation else '')+f'评级依据来自 {independent} 组不同网站且文本不近似的材料，{bodies} 份为正文或接口。'
    if unresolved:explanation+='品牌负面评价尚未确认归属，限制判断确信度。'
    if cashflow.mode!='evidence_anchored':explanation+='实际收支基线缺失，财务推演仅为压力测试。'
    return {'confidence':chosen,'confidence_label':{'low':'低确信度','medium':'中等确信度','high':'较高确信度'}[chosen],
        'confidence_explanation':explanation+'确信度表示本次证据对判断的支持程度，不是准确率或违约概率。',
        'confidence_dimensions':[{'label':'依据独立性','value':f'{independent} 组'}, {'label':'正文／接口支持','value':f'{bodies} 份'},
            {'label':'近一年带日期依据','value':f'{dated} 份（日期仍待核实）'},
            {'label':'评价审阅覆盖','value':f'{reviews.reviewed_count}/{reviews.collected_count} 条'},
            {'label':'实际收支基线','value':'有同期间现金收支资料' if cashflow.mode=='evidence_anchored' else '缺失，仅条件试算'}]}
