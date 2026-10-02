"""Live discovery and a separately sourced, LangGraph-backed investigation."""
import asyncio
import hashlib
import re
import uuid
from fastapi import HTTPException
from app.db import consumer as cache
from app.schemas.consumer import Discovery, IdentityCandidate, Step, Analysis, Change, Interpretation, RiskAssessment
from app.services import consumer_search as web, consumer_agent, consumer_indicators
from app.services.consumer_registry import lookup

COMPANY = re.compile(r'[\u4e00-\u9fffA-Za-z0-9（）()·]{4,48}?(?:股份有限公司|有限责任公司|有限公司|个人独资企业|个体工商户)')
ADVERSE = re.compile('处罚|闭店|停业|歇业|欠薪|退款|注销|变更|交接|更名|执行|诉讼')


def extract_names(text):
    names = []
    for match in COMPANY.finditer(text):
        name = match.group()
        for prefix in ('经营主体为', '运营主体为', '版权所有', '公司名称', '企业名称', '由', '关于', '欢迎来到', '为您提供', '怎么样', '基本信息', '注册'):
            if prefix in name:
                name = name.split(prefix)[-1]
        if re.search(r'\d{2,4}年|\d{1,2}月|\d{1,2}日|成立于|注册于', name):
            continue  # A sentence such as "成立于2021年11月26日的有限责任公司" is not a legal name.
        normalized = name.replace('（','(').replace('）',')')
        if normalized.count('(') != normalized.count(')'):
            continue
        if 6 <= len(name) <= 60 and name not in names:
            names.append(name)
    return names


async def discovery(body):
    pairs = await asyncio.gather(
        web.search(f'{body.query} {body.location} 公司 经营主体'.strip(), '查找主体'),
        web.search(body.query, '查找品牌与公开资料'),
        web.search(body.query + ' 所属公司 企查查', '核对公司名称'))
    registry, registry_step, registry_name = await lookup(body.query)
    trace = [p[1] for p in pairs] + [registry_step]
    sources = web.diverse(registry + [s for rows, _ in pairs for s in rows if web.relevant(s, body.query)], limit=36)
    if not sources and all(t.status == 'failed' for _, t in pairs):
        old = cache.get(query=body.query, location=body.location)
        if old:
            old.mode = 'cached'
            old.trace = trace + [Step(action='历史缓存', status='cached', detail=f'展示 {old.generated_at} 的查询，未完成本次更新')]
            for s in old.sources:
                s.cached = True
            return old
    readable = [s for s in sources if s.channel != 'registry'][:4]
    texts = await asyncio.gather(*(web.read_page(s) for s in readable))
    names = {registry_name: [s.id for s in registry]} if registry_name else {}
    pages = {s.id: t for s, t in zip(readable, texts)}
    for source in sources:
        text = pages.get(source.id, '')
        for name in extract_names(source.title + '；' + source.excerpt + '；' + text):
            names.setdefault(name, []).append(source.id)
        if text and extract_names(text):
            name = extract_names(text)[0]
            pos = text.index(name)
            source.excerpt = text[max(0, pos-80):pos+len(name)+330]
            source.verification_status = 'page_text'
    candidates = []
    for name, ids in list(names.items())[:18]:
        # Another source can supply the clean legal name; navigation prefixes remain noise.
        if any(name != other and name.endswith(other) and
               (name[:-len(other)] in {'地址','注册地址','基本信息','注册','怎么样','所属公司','经营主体'} or name[:-len(other)].endswith(('是','为','提供','关于','分公司')) or any(noise in name[:-len(other)] for noise in ('开通','预约','认证服务','快速申请','热搜榜','品牌介绍','企业信息','法律诉讼等','IT技术服务')))
               for other, other_ids in names.items()):
            continue
        ids = [s.id for s in sources if s.id in ids and name in s.title + s.excerpt]
        if ids:
            candidates.append(IdentityCandidate(id=hashlib.sha256(name.encode()).hexdigest()[:20], name=name,
                basis='本次接口或网页材料中出现的公司名称；需要您确认研究对象，具体门店归属尚未核实', source_ids=list(dict.fromkeys(ids))))
    trace.append(Step(action='名称消歧', status='needs_confirmation', detail=f'找到 {len(candidates)} 个主体候选；不会自动把品牌或总部等同于门店经营者'))
    result = Discovery(investigation_id=uuid.uuid4().hex, query=body.query, location=body.location, generated_at=web.now(),
        mode='live_search' if sources or any(t.status == 'completed' for t in trace) else 'unavailable',
        candidates=candidates, sources=sources, trace=trace,
        unknowns=['品牌、总部、加盟商与具体门店不自动合并。', '输入非企业关键词时会查找关联公司；没有可靠候选时请补充城市、门店位置或完整公司名。'])
    if sources:
        cache.save(result)
    return result


async def analysis(body):
    previous = cache.get(ident=body.investigation_id)
    if not previous:
        raise HTTPException(409, detail={'code': 'investigation_expired', 'message': '查询记录已过期或不存在，请重新搜索。', 'details': []})
    identity = next((c for c in previous.candidates if c.id == body.candidate_id), None)
    if not identity:
        raise HTTPException(422, detail={'code': 'candidate_mismatch', 'message': '候选不属于本次查询，请重新确认主体。', 'details': []})
    original = [s for s in previous.sources if s.id in identity.source_ids and web.relevant(s, identity.name)]
    state = await consumer_agent.investigate(identity, original, body, previous.query, previous.location)
    sources, reference = state['sources'], state['criteria']
    trace = previous.trace + [Step(action='确认研究对象', status='user_selected', detail=f'研究 {identity.name}；不等于确认门店归属', source_ids=identity.source_ids)] + state['trace']
    trace.append(Step(action='数据库学习参考', status=reference['status'],
        detail=f"使用 {reference['sample_count']} 条原文支持样本的主题参考；匹配仅决定复核方向，不作为当前公司证据"))
    indicators = consumer_indicators.build(identity, sources, state['trace'], state['findings'])
    counter = next(i for i in indicators if i.id == 'counter')
    changes = []
    for source in [s for s in sources if s.scope == 'selected_entity' and web.signal_matches(s, ADVERSE) and s.id not in counter.source_ids][:3]:
        changes.append(Change(id='lead-' + source.id, title=source.title, affected_entity=identity.name + '（具体事件主体待核对）',
            fact_text=source.excerpt, source_ids=[source.id],
            consumer_relevance='这是一条待核实材料；当前没有证据证明它会影响所选门店的服务履行。',
            interpretations=[Interpretation(text='需核对事件主体、时间与后续处理；材料可能涉及其他门店或已经处理的事项。', supporting_source_ids=[source.id])],
            missing_evidence=['准确事件主体与日期', '后续状态', '与本次服务的关系']))
    questions = [f'“{identity.name}”是否实际运营这家门店？营业执照和品牌关联依据是什么？']
    questions += [f.question for f in state['findings']][:2]
    if not state['findings']:
        if changes:
            questions.append(f'“{changes[0].title[:55]}”涉及这家门店吗，目前处理到哪一步？')
        intention = {'initial_purchase': '新购买的服务', 'top_up': '新增服务与原有余额', 'renewal': '续费后的服务', 'explore': '拟了解的服务'}[body.intent]
        questions.append(f'由哪个主体承接{intention}，调整服务时由谁处理未履行部分？')
    unavailable = not any(t.status == 'completed' for t in state['trace'] if t.action in {*consumer_agent.TOPICS, '企查查', '企查查 MCP', '智能体补查', '品牌门店补查', '品牌小红书补查', '数据库建议复核'} or t.action.startswith('品牌'))
    if unavailable:
        for source in sources:
            source.cached = True
    model_used = state['model_calls'] > 0
    agent_status = ('推理模型已参与工具规划或证据解释' if model_used else '未完成推理模型调用，仅执行真实检索和规则指标')
    if state['model_failed']:
        agent_status += '；部分模型调用或引用校验失败，已标记回退'
    return Analysis(analysis_id=uuid.uuid4().hex, company_id=identity.id, generated_at=web.now(),
        evidence_as_of=previous.generated_at if unavailable else web.now(), mode='cached_evidence' if unavailable else 'live_search_agent' if model_used else 'live_search_rules',
        fallback=state['model_failed'], coverage_status='unverified_leads' if sources else 'insufficient_evidence',
        identity=identity, summary=f'已取得 {len(sources)} 条来源材料，覆盖 {len({web.publisher_key(s.url) for s in sources})} 个网站。风险为公开资料初判，各项依据可在下方核对。',
        changes=changes, questions=list(dict.fromkeys(questions))[:3],
        unknowns=['查询时间不等于证据公开日期；本次未确认的日期和变化趋势保持未知。',
            '小红书为公开网页索引，未接入平台私有数据或登录内容。', reference['limitation'],
            *(['本轮补查全部失败，仅保留之前取得的材料。'] if unavailable else [])],
        sources=sources, trace=trace, criteria=reference, counter_search_status=counter.value,
        counter_source_ids=counter.source_ids, agent_status=agent_status, indicators=indicators,
        agent_model_used=model_used, agent_rounds=state['rounds'],
        risk=RiskAssessment(explanation='本轮联网补查失败，历史材料不足以评级。') if unavailable else state['risk'],
        reviews=state['reviews'], cashflow=state['cashflow'],
        source_stats={'total': len(sources), 'websites': len({web.publisher_key(s.url) for s in sources}),
            'company': sum(s.scope == 'selected_entity' for s in sources),
            'community': sum(s.channel == 'community' for s in sources),
            'body_or_api': sum(s.verification_status != 'search_excerpt' for s in sources),
            'search_queries': sum(t.action in {*consumer_agent.TOPICS, '智能体补查', '数据库建议复核'} or t.action.startswith('品牌') for t in state['trace'])})
