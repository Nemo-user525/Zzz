"""Bounded LangGraph agent: independent search + DB reference + adaptive tools.

Only tool actions and evidence summaries are exposed, never hidden reasoning.
The model cannot invent URLs, change identity or declare evidence verified.
"""
import asyncio
import httpx
from typing import TypedDict
from pydantic import Field
from langgraph.graph import StateGraph, START, END
from app.schemas.consumer import Strict, Step, AgentFinding
from app.services import consumer_search as web, consumer_criteria as criteria, consumer_model, llm
from app.services.consumer_registry import lookup

TOPICS = {
    '经营变化': '经营主体 变更 公告',
    '服务持续': '门店 营业 停业 交接',
    '退款履约': '会员 退款 课包 消费者',
    '回应反证': '回应 澄清 恢复营业 退款进展',
    '小红书线索': 'site:xiaohongshu.com',
    '官方记录': '处罚 经营异常 site:gov.cn',
    '新闻报道': '新闻 报道 近况',
}


class Plan(Strict):
    search_terms: list[str] = Field(default_factory=list, max_length=2)
    read_source_ids: list[str] = Field(default_factory=list, max_length=2)


class Findings(Strict):
    findings: list[AgentFinding] = Field(max_length=6)


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
    name = state['identity']['name']
    results = await asyncio.gather(*(web.search(name + ' ' + term, topic) for topic, term in TOPICS.items()))
    registry, registry_step, _ = await lookup(name, exact=True)
    # Retain diversity across topics instead of allowing the first query to fill the budget.
    rows = web.dedupe(state['sources'] + registry + [s for items, _ in results for s in items[:4] if web.relevant(s, name)])[:36]
    learned = await asyncio.to_thread(reference, rows)
    terms = list(dict.fromkeys(m['search_terms'] for m in learned.get('matches', []) if m.get('search_terms')))[:2]
    recommended = await asyncio.gather(*(web.search(name + ' ' + term, '数据库建议复核') for term in terms))
    rows = web.dedupe(rows + [s for items, _ in recommended for s in items[:2] if web.relevant(s, name)])
    reads = await read_sources([s for s in rows if s.verification_status == 'search_excerpt'][:3], name)
    related, related_steps = [], []
    query = state['context'].get('query', '')
    if query and query != name:
        brand_results = await asyncio.gather(*(web.search(query + ' ' + state['context'].get('location', '') + ' ' + term, purpose)
            for term, purpose in [('新闻 门店 退款', '品牌门店补查'), ('site:xiaohongshu.com', '品牌小红书补查')]))
        related_steps = [step for _, step in brand_results]
        for items, _ in brand_results:
            for row in items[:4]:
                if web.relevant(row, query):
                    row.scope = 'selected_entity' if web.relevant(row, name) else 'brand_context'
                    related.append(row)
    rows = web.dedupe(rows + related)
    return {'sources': rows, 'trace': state['trace'] + [t for _, t in results] + [t for _, t in recommended] + [registry_step] + reads + related_steps,
            'criteria': await asyncio.to_thread(reference, rows), 'executed_queries': list(TOPICS.values()) + terms}


def payload(state):
    return {k: state[k] for k in ('identity', 'context', 'criteria', 'executed_queries')} | {
        'sources': [s.model_dump() for s in state['sources']],
        'tool_results': [t.model_dump() for t in state['trace'][-18:]]}


async def plan(state):
    if llm.effective_mode() == 'offline' or state['rounds'] >= 2 or state['model_failed']:
        return {'plan': Plan()}
    try:
        decision = await consumer_model.structured(
            '根据已取得材料和缺口决定下一轮工具。search_terms仅是附加检索词（系统自动加主体名），'
            '最多2条、每条不超过80字符；优先查不同解释和后续处理，不重复查询。'
            'read_source_ids只能选给定来源。无需补查时返回两个空数组。', payload(state), Plan)
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
    rows = web.dedupe(state['sources'] + [s for items, _ in results for s in items if web.relevant(s, name)])[:48]
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
            if not source or source.scope != 'selected_entity' or not web.relevant(source, name) or citation.quote not in source.excerpt:
                raise ValueError('unsupported_citation')
    return findings


async def synthesize(state):
    if llm.effective_mode() == 'offline':
        return {'findings': [], 'trace': state['trace'] + [Step(action='智能体解释', status='not_configured', detail='未配置在线模型；仅展示 LangGraph 执行的公开检索与规则指标') ]}
    try:
        result = await consumer_model.structured(
            '对六个消费者指标给出简短解释和一个具体核实问题。只输出有本次来源支持的项目。'
            '每项必须引用 source_id 和逐字位于 excerpt 的短 quote；不引用训练样本作为当前企业证据。'
            '区分材料声称、可能解释和未证实的服务联系；回应材料不自动推翻其他事件。'
            '数据库主题匹配只帮助发现要问的问题，你必须独立分析资料，并提出其他可能解释。'
            '不能给出安全结论、概率、未核实的事件日期或趋势；证据不足返回空 findings。', payload(state), Findings)
        findings = validate_findings(result.findings, state['sources'], state['identity']['name'])
        return {'findings': findings, 'model_calls': state['model_calls'] + 1,
                'trace': state['trace'] + [Step(action='智能体解释', status='completed', detail=f'生成 {len(findings)} 项带原文引用的 AI 解释；未升级事实等级')]}
    except (ValueError, KeyError, IndexError, TypeError, httpx.HTTPError):
        return {'findings': [], 'model_failed': True,
                'trace': state['trace'] + [Step(action='智能体解释', status='failed', detail='模型输出或逐字引用校验失败，已回退证据指标') ]}


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
        'rounds': 0, 'model_calls': 0, 'model_failed': False, 'findings': [], 'executed_queries': []},
        config={'recursion_limit': 12})
