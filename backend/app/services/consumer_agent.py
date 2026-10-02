"""Bounded LangGraph agent: independent search + DB reference + adaptive tools.

Only tool actions and evidence summaries are exposed, never hidden reasoning.
The model cannot invent URLs, change identity or declare evidence verified.
"""
import asyncio
import httpx
from typing import TypedDict
from pydantic import Field
from langgraph.graph import StateGraph, START, END
from app.schemas.consumer import Strict, Step, AgentFinding, RiskReason, RiskAssessment, ReviewObservation, CashflowFact, ReviewAssessment, CashflowAssessment
from app.services import consumer_search as web, consumer_criteria as criteria, consumer_model, consumer_risk, consumer_outlook, llm
from typing import Literal
from app.services.consumer_progress import update
from app.services.consumer_registry import lookup

TOPICS = {
    '经营变化': '经营主体 变更 公告',
    '服务持续': '门店 营业 停业 交接',
    '退款履约': '会员 退款 课包 消费者',
    '回应反证': '回应 澄清 恢复营业 退款进展',
    '小红书线索': 'site:xiaohongshu.com',
    '官方记录': '处罚 经营异常 site:gov.cn',
    '新闻报道': '新闻 报道 近况',
    '企业官网': '官网 联系我们 关于我们',
    '工商关联': '股东 分支机构 经营者',
    '法院公示': '执行 判决 裁定 site:court.gov.cn',
    '消费者投诉': '投诉 维权 site:tousu.sina.com.cn',
    '微博反馈': 'site:weibo.com',
    '知乎讨论': 'site:zhihu.com',
    '豆瓣讨论': 'site:douban.com',
    '贴吧讨论': 'site:tieba.baidu.com',
    '哔哩哔哩': 'site:bilibili.com',
    '抖音公开页': 'site:douyin.com',
    '大众点评': 'site:dianping.com',
    '本地媒体': '门店 消费者 城市 新闻',
    '员工供应商': '员工 工资 供应商 付款',
    '经营正向材料': '新店 开业 正常营业 服务 公告',
    '后续处理': '整改 撤销 履行完毕 和解 退款完成',
    '经营收支': '经营活动现金流入 现金流出 营业收入 成本 年报',
    '用户口碑': '用户评价 顾客反馈 好评 差评 服务体验',
}


class Plan(Strict):
    search_terms: list[str] = Field(default_factory=list, max_length=2)
    read_source_ids: list[str] = Field(default_factory=list, max_length=2)


class Findings(Strict):
    findings: list[AgentFinding] = Field(max_length=6)
    reviews: list[ReviewObservation] = Field(default_factory=list, max_length=12)
    cashflow_facts: list[CashflowFact] = Field(default_factory=list, max_length=4)


class RiskDraft(Strict):
    level: Literal['low', 'medium', 'high', 'undetermined']
    explanation: str = Field(min_length=6, max_length=400)
    reasons: list[RiskReason] = Field(max_length=6)
    confidence: Literal['low', 'medium', 'high'] = 'low'
    confidence_explanation: str = Field(default='', max_length=180)
    review_impact: str = Field(default='未取得可纳入判断的评价解释。', max_length=280)
    cashflow_impact: str = Field(default='财务证据不足，不能由假设情景认定企业资金短缺。', max_length=280)


class State(TypedDict, total=False):
    identity: dict
    context: dict
    sources: list
    trace: list
    criteria: dict
    rounds: int
    model_calls: int
    model_failed: bool
    plan: Plan
    executed_queries: list
    findings: list
    risk: RiskAssessment
    reviews: ReviewAssessment
    cashflow: CashflowAssessment


async def risk_draft(instruction, data):
    try:
        return await consumer_model.structured(instruction, data, RiskDraft), 1
    except ValueError:
        update('最终输出格式未通过，正在用同一证据重试结构化评级…')
        return await consumer_model.structured(instruction + ' 上一轮未生成可校验的完整JSON。基于同一证据简洁输出，禁止补造引文。',
                                               data, RiskDraft, reasoning=False), 2


def reference(rows):
    return criteria.reference(' '.join(s.excerpt for s in rows if s.scope == 'selected_entity'))


async def read_sources(rows, name):
    texts = await asyncio.gather(*(web.read_page(s) for s in rows))
    for source, text in zip(rows, texts):
        if name in text:
            pos = text.index(name)
            excerpt = text[max(0, pos-60):pos+len(name)+330]
            if not web.navigation_excerpt(excerpt):
                source.excerpt = excerpt
                source.verification_status = 'page_text'
            else:
                source.page_status = '已读取网页，但主体附近仅为导航目录；保留搜索摘要，未确认实际事件'
    return [Step(action='读取原文', status='completed' if text else 'failed',
                 detail=s.page_status, source_ids=[s.id]) for s, text in zip(rows, texts)]


async def collect(state):
    update('正在跨网站检索公司、门店、新闻、公告与社区反馈…')
    name = state['identity']['name']
    results = await asyncio.gather(*(web.search(name + ' ' + term, topic) for topic, term in TOPICS.items()))
    registry, registry_step, _ = await lookup(name, exact=True)
    # Retain diversity across topics instead of allowing the first query to fill the budget.
    rows = web.diverse(state['sources'] + registry + [s for items, _ in results for s in items if web.relevant(s, name)], limit=120)
    learned = await asyncio.to_thread(reference, rows)
    terms = list(dict.fromkeys(m['search_terms'] for m in learned.get('matches', []) if m.get('search_terms')))[:2]
    recommended = await asyncio.gather(*(web.search(name + ' ' + term, '数据库建议复核') for term in terms))
    rows = web.diverse(rows + [s for items, _ in recommended for s in items if web.relevant(s, name)], limit=120)
    update(f'已收集 {len(rows)} 条公司资料，正在读取原文并补查品牌反馈…')
    reads = await read_sources(web.diverse([s for s in rows if s.verification_status == 'search_excerpt'], limit=16), name)
    related, related_steps = [], []
    query = state['context'].get('query', '')
    if query and query != name:
        brand_results = await asyncio.gather(*(web.search(query + ' ' + state['context'].get('location', '') + ' ' + term, purpose)
            for term, purpose in [('新闻 门店 退款', '品牌门店补查'), ('site:xiaohongshu.com', '品牌小红书补查'),
                *[(term, '品牌' + topic) for topic, term in TOPICS.items() if topic in {'微博反馈','知乎讨论','豆瓣讨论','贴吧讨论','消费者投诉','大众点评','哔哩哔哩','本地媒体','经营正向材料'}]]))
        related_steps = [step for _, step in brand_results]
        for items, _ in brand_results:
            for row in items:
                if web.relevant(row, query):
                    row.scope = 'selected_entity' if web.relevant(row, name) else 'brand_context'
                    related.append(row)
    rows = web.diverse(rows + related, limit=160)
    return {'sources': rows, 'trace': state['trace'] + [t for _, t in results] + [t for _, t in recommended] + [registry_step] + reads + related_steps,
            'criteria': await asyncio.to_thread(reference, rows), 'executed_queries': list(TOPICS.values()) + terms,
            'reviews':consumer_outlook.summarize_reviews([], rows, completed=False),
            'cashflow':consumer_outlook.simulate([], rows, name)}


def payload(state, rows=None):
    return {k: state[k] for k in ('identity', 'context', 'criteria', 'executed_queries')} | {
        'as_of': web.now(),
        'sources': [{k: getattr(s, k) for k in ('id','title','excerpt','channel','scope','verification_status','published_at','date_semantics')} | {'review_required':consumer_outlook.review_material(s)} for s in (rows if rows is not None else web.diverse(state['sources'], limit=16))],
        'tool_results': [t.model_dump() for t in state['trace'][-6:]]}


async def plan(state):
    if consumer_model.effective_mode() == 'offline' or state['rounds'] >= 2 or state['model_failed']:
        return {'plan': Plan()}
    try:
        update(f'推理模型正在决定第 {state["rounds"] + 1} 轮补查内容…')
        decision = await consumer_model.structured(
            '根据已取得材料和缺口决定下一轮工具。search_terms仅是附加检索词（系统自动加主体名），'
            '最多2条、每条不超过80字符；优先查不同解释和后续处理，不重复查询。'
            'read_source_ids只能选给定来源。无需补查时返回两个空数组。此任务仅选择下一步工具，简短判断即可，不要反复分析最终等级。', payload(state), Plan, reasoning=False)
        known = {s.id for s in state['sources'] if s.verification_status != 'provider_response'}
        if not set(decision.read_source_ids) <= known or any(len(t) > 80 or not t.strip() or '\n' in t for t in decision.search_terms):
            raise ValueError('invalid_tool_arguments')
        decision.search_terms = [t for t in dict.fromkeys(decision.search_terms) if t not in state['executed_queries']]
        return {'plan': decision, 'model_calls': state['model_calls'] + 1,
                'trace': state['trace'] + [Step(action='智能体补查计划', status='completed',
                    detail=f'选择 {len(decision.search_terms)} 次补查、{len(decision.read_source_ids)} 份原文；最多两轮', source_ids=decision.read_source_ids)]}
    except (ValueError, KeyError, IndexError, TypeError, httpx.HTTPError):
        return {'plan': Plan(), 'model_failed': True,
                'trace': state['trace'] + [Step(action='智能体补查计划', status='failed', detail='模型或工具参数校验失败；保留真实检索资料') ]}


async def act(state):
    decision, name = state['plan'], state['identity']['name']
    results = await asyncio.gather(*(web.search(name + ' ' + term, '智能体补查') for term in decision.search_terms))
    rows = web.diverse(state['sources'] + [s for items, _ in results for s in items if web.relevant(s, name)], limit=160)
    reads = await read_sources([s for s in rows if s.id in decision.read_source_ids], name)
    return {'sources': rows, 'rounds': state['rounds'] + 1,
            'executed_queries': state['executed_queries'] + decision.search_terms,
            'trace': state['trace'] + [t for _, t in results] + reads,
            'criteria': await asyncio.to_thread(reference, rows)}


def validate_findings(findings, rows, name):
    sources = {s.id: s for s in rows}
    for finding in findings:
        for citation in finding.citations:
            source = sources.get(citation.source_id)
            if not source or source.scope != 'selected_entity' or not web.relevant(source, name):
                raise ValueError('unsupported_citation')
            citation.quote = web.ground_quote(citation.quote, source.excerpt)
    return findings


async def synthesize(state):
    if consumer_model.effective_mode() == 'offline':
        return {'findings': [], 'trace': state['trace'] + [Step(action='智能体解释', status='not_configured', detail='未配置推理模型；仅展示 LangGraph 执行的公开检索与规则指标') ]}
    eligible = state['sources']
    findings, observations, facts, reviewed_ids = [], [], [], set()
    synthesis_calls = 0
    try:
        rejected_findings = 0
        batch_size = 6 if consumer_model.effective_mode() == 'ollama' else 12
        batches = [eligible[i:i+batch_size] for i in range(0, len(eligible), batch_size)]
        for batch in batches:
            update(f'推理模型正在分批核对资料（{batches.index(batch)+1}/{len(batches)}）…')
            instruction = (
            '对六个消费者指标给出简短解释和一个具体核实问题。每批最多3项，合并重复主题。解释不超过100字，引文选择15至60字的关键原句。只输出有本次来源支持的项目。'
            '每项必须引用 source_id 和逐字位于 excerpt 的短 quote；不引用训练样本作为当前企业证据。'
            '区分材料声称、可能解释和未证实的服务联系；回应材料不自动推翻其他事件。'
            '数据库主题匹配只帮助发现要问的问题，你必须独立分析资料，并提出其他可能解释。'
            '不能给出安全结论、概率、未核实的事件日期或趋势；findings只能引用selected_entity材料。'
            'reviews必须覆盖本批每个review_required=true的来源，每个恰好一项，包括品牌资料；按正面/负面/混合/不明确分类，'
            '导航、新闻、品牌营销和官方账号宣传不是顾客评价，kind=non_review，不能计为正面顾客反馈。quote必须逐字复制excerpt。'
            'cashflow_facts仅提取所选公司明确披露的“经营活动现金流入小计/流出小计”，'
            '原句必须同时包含金额、元/万元/亿元单位和完整年或年月，period填YYYY或YYYY-MM。'
            '营业收入、净利润、融资额不能充当现金收付款。无此数据返回空数组。保持推理和最终解释简洁。')
            data = payload(state, batch)
            for attempt in range(2):
                try:
                    result = await consumer_model.structured(instruction, data, Findings, reasoning=False)
                    synthesis_calls += 1
                except ValueError:
                    if attempt:raise
                    instruction += ' 上一版结构或编号无效，请严格遵守schema，citation_id只能选择本批列出的完整编号。'
                    continue
                try:
                    valid_findings = validate_findings(result.findings, batch, state['identity']['name'])
                    valid_reviews = consumer_outlook.validate_reviews(result.reviews, batch)
                    valid_facts = consumer_outlook.validated_facts(result.cashflow_facts, batch, state['identity']['name'])
                    break
                except ValueError:
                    if attempt:
                        # An unsupported observation is omitted in full, never patched into a claim.
                        valid_findings = []
                        for finding in result.findings:
                            try:valid_findings.extend(validate_findings([finding],batch,state['identity']['name']))
                            except ValueError:rejected_findings += 1
                        # Review coverage remains mandatory, including brand-context feedback.
                        valid_reviews = consumer_outlook.validate_reviews(result.reviews, batch)
                        valid_facts = consumer_outlook.validated_facts(result.cashflow_facts, batch, state['identity']['name'])
                        break
                    update('正在复核引文与评价覆盖，要求模型修正不能定位的引用…')
                    data = data | {'previous_answer':result.model_dump(), 'correction':'上一版有引文无法逐字定位或评价缺项。请重新核对每个source_id，quote只能截取同一excerpt中的连续原句，不拼接，不更改标点；reviews覆盖本批每个review_required来源。删除无依据的解释，不编造替代。'}
            findings.extend(valid_findings)
            observations.extend(valid_reviews)
            facts.extend(valid_facts)
            reviewed_ids.update(s.id for s in batch)
        reviews = consumer_outlook.summarize_reviews(observations, eligible)
        cashflow = consumer_outlook.simulate(facts, eligible, state['identity']['name'])
        # All materials are read in the map stage. Keep the reduce prompt bounded on 16K hardware.
        selected_findings = [f for key in ('identity','continuity','refund','changes','counter','coverage') for f in [x for x in findings if x.indicator_id==key][:2]]
        selected_reviews = [o for scope in ('selected_entity','brand_context') for sentiment in ('negative','positive','mixed','unclear')
            for o in [x for x in reviews.observations if x['scope']==scope and x['sentiment']==sentiment and not x['duplicate_of']][:2]]
        review_summary = reviews.model_dump(exclude={'observations'}) | {'representative_observations':[{k:v for k,v in o.items() if k not in {'quote','published_at','duplicate_of'}} for o in selected_reviews],
            'scope_counts':{scope:sum(o['scope']==scope for o in reviews.observations) for scope in ('selected_entity','brand_context')}}
        risk_data = payload(state, []) | {'findings': [{'indicator_id':f.indicator_id,'explanation':f.explanation,'source_ids':[c.source_id for c in f.citations]} for f in selected_findings],
            'reviews': review_summary,
            'cashflow': cashflow.model_dump(exclude={'scenarios'}) | {'scenarios':[{k:v for k,v in s.items() if k!='months'} for s in cashflow.scenarios]},
            'coverage': {'total': len(eligible), 'company_sources_reviewed': sum(s.scope=='selected_entity' for s in eligible), 'brand_sources_reviewed': sum(s.scope=='brand_context' for s in eligible)},
            'aggregation': '全部材料已逐批阅读。以下按指标、评价倾向和主体范围分组保留引用样本；统计涵盖全部评价。未展示原文不等于不存在。'}
        cited_ids = {c.source_id for f in selected_findings for c in f.citations} | {o['source_id'] for o in selected_reviews} | {f.citation.source_id for f in facts}
        risk_data['sources'] = [{k: v for k, v in s.items() if k != 'excerpt'} | {
            'quote_passages': list(dict.fromkeys([c.quote for f in selected_findings for c in f.citations if c.source_id == s['id']] + [o['quote'] for o in selected_reviews if o['source_id']==s['id']] + [f.citation.quote for f in facts if f.citation.source_id==s['id']]))}
            for s in payload(state, [s for s in eligible if s.id in cited_ids])['sources']]
        risk_data.pop('tool_results', None)
        if not risk_data['sources']:
            risk_data['sources'] = payload(state,eligible[:4])['sources']
        update('正在综合数据库参考、当前证据与回应材料，校验风险等级和引用…')
        instruction = (
            '依据已逐批阅读的资料、带原文引用的观察及数据库主题参考，独立评估消费者预付服务风险。'
            '等级 low=多渠道具体正向依据充分且没有尚待解决的显著不利线索；medium=有需核实的不利线索；'
            'high=多来源支持的严重持续履约问题；undetermined=信息不足或主体/时间矛盾无法判定。'
            '不要用数据库主题相似度或资料数量直接算等级。每项理由必须引用本次 source_id 与逐字 excerpt；'
            '必须考虑回应、事件是否过时、总部与门店区别；超过两年的材料没有当前后续时只作context，不作当前adverse。资料缺失不能作为 adverse。禁止输出跑路概率。'
            '必须综合reviews中的全部评价（含正面、负面、品牌归属不明和重复文本）及cashflow收支模拟，'
            '在review_impact和cashflow_impact分别说明如何影响等级或不确定性。品牌资料仅可作context理由，不能当所选公司的adverse证据。'
            '收支情景的固定百分比是假设，不是实际预测；无真实现金收支基线不能据此认定公司资金短缺。'
            '用户数量、教练数量、宣传简介和单次诉讼胜诉不能证明当前经营稳定、正常运营或未来履约能力；缺少直接正文支持时只描述原始事实。'
            '同时给出confidence低/中/高及简短依据，这是判断证据充分度，禁止虚构准确率。保持推理简洁。'
            'reasons只能引用sources里的source_id和连续原句；数据库、调查状态、评价统计和模拟假设不是可引用来源。没有可引用事实时reasons=[]。')
        draft, draft_calls = await risk_draft(instruction, risk_data)
        synthesis_calls += draft_calls
        try:
            risk = consumer_risk.assess(draft, state['sources'], state['identity']['name'], consumer_model.model_name(), sum(s.scope=='selected_entity' for s in eligible), reviews, cashflow)
        except ValueError:
            update('风险综合已完成，正在修正评级依据的引用格式…')
            draft = await consumer_model.structured(instruction, risk_data | {'previous_answer':draft.model_dump(),
                'correction':'上一版来源校验失败。只保留由所选原文片段直接支持的理由。超过两年且无当前后续的负面只能作context；话题聚合页不能证明其中其他新闻属于该公司；官网署名与App宣传不能证明企业存续；用户数量、宣传和单次诉讼胜诉不能推出经营稳定或履约能力；现金流、资金链与模拟不能引用无财务内容的网页。未知source_id、导航栏目、跨主体负面或引用系统统计必须删除。重新检查等级，必要时undetermined，reasons可为空。'}, RiskDraft, reasoning=False)
            synthesis_calls += 1
            risk = consumer_risk.assess(draft, state['sources'], state['identity']['name'], consumer_model.model_name(), sum(s.scope=='selected_entity' for s in eligible), reviews, cashflow, discard_invalid=True)
        return {'findings': findings, 'risk': risk, 'reviews':reviews, 'cashflow':cashflow, 'model_calls': state['model_calls'] + synthesis_calls,
                'trace': state['trace'] + [Step(action='智能体解释', status='completed', detail=f'分 {len(batches)} 批阅读全部 {len(eligible)} 条资料，审阅 {len(observations)} 条评价材料；剔除 {rejected_findings} 项引用未通过的解释，结合收支情景生成风险与确信度')]}
    except (ValueError, KeyError, IndexError, TypeError, httpx.HTTPError) as exc:
        reviews = consumer_outlook.summarize_reviews(observations, eligible, completed=len(reviewed_ids)==len(eligible))
        cashflow = consumer_outlook.simulate(facts, eligible, state['identity']['name'])
        return {'findings': findings, 'reviews':reviews, 'cashflow':cashflow,
                'model_calls':state['model_calls']+synthesis_calls,
                'risk': RiskAssessment(explanation='最终模型评估未完成；已核对的证据与评价予以保留。企业风险仍未知，预付决策采用信息不足时的谨慎规则。',
                    review_impact=f'已审阅 {reviews.reviewed_count}/{reviews.collected_count} 条评价材料；最终综合未完成，逐条结果保留在下方。',
                    cashflow_impact='收支情景已生成并保留；最终综合未完成，假设情景不用于认定公司资金短缺。',
                    reviewed_source_count=sum(s.id in reviewed_ids and s.scope=='selected_entity' for s in eligible)), 'model_failed': True,
                'trace': state['trace'] + [Step(action='智能体解释', status='failed', detail=f'最终评估未完成（{type(exc).__name__}）；已保留 {len(reviewed_ids)} 条资料的阅读结果，决策风险使用公开的谨慎规则') ]}


def build_graph():
    graph = StateGraph(State)
    for name, node in [('collect', collect), ('plan', plan), ('tools', act), ('synthesize', synthesize)]:
        graph.add_node(name, node)
    graph.add_edge(START, 'collect')
    graph.add_edge('collect', 'plan')
    graph.add_conditional_edges('plan', lambda s: 'tools' if s['plan'].search_terms or s['plan'].read_source_ids else 'synthesize')
    graph.add_edge('tools', 'plan')
    graph.add_edge('synthesize', END)
    return graph.compile()


GRAPH = build_graph()


async def investigate(identity, original, body, query='', location=''):
    return await GRAPH.ainvoke({'identity': identity.model_dump(),
        'context': body.model_dump(exclude={'investigation_id', 'candidate_id', 'amount_yuan'}) | {'query': query, 'location': location},
        'sources': original, 'trace': [], 'criteria': await asyncio.to_thread(reference, original),
        'rounds': 0, 'model_calls': 0, 'model_failed': False, 'findings': [], 'risk': RiskAssessment(), 'reviews':ReviewAssessment(), 'cashflow':CashflowAssessment(), 'executed_queries': []},
        config={'recursion_limit': 12})
