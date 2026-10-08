"""Consumer research contract. Search hits are leads, never verified facts."""
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class DiscoveryInput(Strict):
    query: str = Field(min_length=2, max_length=80, pattern=r'^[^\x00-\x1f\x7f]+$')
    location: str = Field(default='', max_length=60, pattern=r'^[^\x00-\x1f\x7f]*$')


class AnalysisInput(Strict):
    investigation_id: str = Field(max_length=64)
    candidate_id: str = Field(max_length=64)
    intent: Literal['initial_purchase', 'top_up', 'renewal', 'explore'] = 'explore'
    service_category: Literal['fitness', 'education', 'beauty', 'eldercare', 'other'] = 'fitness'
    amount_yuan: float | None = Field(default=None, ge=0, le=100000000, allow_inf_nan=False)
    service_duration_months: int | None = Field(default=None, ge=1, le=120)


class Evidence(Strict):
    id: str
    title: str
    url: str
    publisher: str
    excerpt: str
    published_at: str | None = None
    date_semantics: str = '公开日期未核实'
    fetched_at: str
    verification_status: Literal['search_excerpt', 'page_text', 'provider_response'] = 'search_excerpt'
    channel: Literal['public_web', 'community', 'government', 'registry'] = 'public_web'
    purpose: str
    page_status: str = '未读取原网页'
    sha256: str | None = None
    cached: bool = False
    scope: Literal['selected_entity', 'brand_context'] = 'selected_entity'


class IdentityCandidate(Strict):
    id: str
    name: str
    basis: str
    source_ids: list[str]
    relationship_status: str = '网页提及，门店关联尚未核实'
    research_scope: Literal['company', 'store_reviews'] = 'company'
    place: dict[str, str] = Field(default_factory=dict)


class Step(Strict):
    action: str
    status: str
    detail: str
    source_ids: list[str] = Field(default_factory=list)


class Discovery(Strict):
    investigation_id: str
    query: str
    location: str
    generated_at: str
    mode: Literal['live_search', 'cached', 'unavailable']
    candidates: list[IdentityCandidate]
    sources: list[Evidence]
    trace: list[Step]
    unknowns: list[str]


class Interpretation(Strict):
    text: str
    supporting_source_ids: list[str]
    counter_source_ids: list[str] = Field(default_factory=list)
    assessment_status: str = '待核实解释，不是企业结论'


class Change(Strict):
    id: str
    title: str
    affected_entity: str
    fact_text: str
    event_date: str | None = None
    published_at: str | None = None
    date_semantics: str = '未核实发生日；网页时间不等于事件时间'
    stage: str = '待核对原文与事件主体'
    verification_status: str = 'unverified'
    source_ids: list[str]
    consumer_relevance: str
    interpretations: list[Interpretation]
    missing_evidence: list[str]


IndicatorId = Literal['identity', 'continuity', 'refund', 'changes', 'counter', 'coverage']


class Citation(Strict):
    source_id: str
    quote: str = Field(min_length=4, max_length=480)


class AgentFinding(Strict):
    indicator_id: IndicatorId
    explanation: str = Field(min_length=6, max_length=600)
    citations: list[Citation] = Field(min_length=1, max_length=4)
    question: str = Field(min_length=6, max_length=240)


class Indicator(Strict):
    id: IndicatorId
    label: str
    status: Literal['unknown', 'needs_verification', 'leads_found', 'partial', 'searched']
    value: str
    explanation: str
    source_ids: list[str]
    missing: list[str]
    agent_findings: list[AgentFinding] = Field(default_factory=list)


class RiskReason(Strict):
    explanation: str = Field(min_length=6, max_length=400)
    direction: Literal['adverse', 'reassuring', 'context']
    citations: list[Citation] = Field(min_length=1, max_length=4)


class ReviewObservation(Strict):
    source_id: str
    kind: Literal['customer_feedback', 'discussion', 'non_review']
    sentiment: Literal['positive', 'negative', 'mixed', 'unclear']
    summary: str = Field(min_length=6, max_length=180)
    quote: str = Field(min_length=4, max_length=160)


class CashflowFact(Strict):
    kind: Literal['operating_inflow', 'operating_outflow']
    amount_text: str = Field(pattern=r'^\d+(?:,\d{3})*(?:\.\d+)?$')
    unit: Literal['元', '万元', '亿元']
    period: str = Field(pattern=r'^\d{4}(?:-(?:0[1-9]|1[0-2]))?$')
    citation: Citation


class ReviewAssessment(Strict):
    status: Literal['not_reviewed', 'completed'] = 'not_reviewed'
    collected_count: int = 0
    reviewed_count: int = 0
    independent_content_count: int = 0
    counts: dict[str, int] = Field(default_factory=dict)
    observations: list[dict] = Field(default_factory=list)
    limitation: str = '仅覆盖本次收集的公开评价材料；不代表平台全部评论或总体满意率。'


class CashflowAssessment(Strict):
    mode: Literal['evidence_anchored', 'sensitivity_only'] = 'sensitivity_only'
    unit: str = '基准月收款=100的指数，非企业实际金额'
    horizon_months: int = 6
    baseline: dict = Field(default_factory=dict)
    facts: list[CashflowFact] = Field(default_factory=list)
    scenarios: list[dict] = Field(default_factory=list)
    driver_source_ids: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)


class RiskAssessment(Strict):
    decision_level: Literal['low', 'medium', 'high'] = 'medium'
    decision_label: str = '中等决策风险 · 先核实再预付'
    decision_basis: Literal['company_evidence', 'information_gap'] = 'information_gap'
    decision_explanation: str = '信息不足时按谨慎预付规则给出中等决策风险，建议按次或短期购买；这不表示公司存在不良经营事件。'
    level: Literal['low', 'medium', 'high', 'undetermined'] = 'undetermined'
    label: str = '证据不足，暂不评级'
    explanation: str = '尚未完成有来源支持的模型评估。'
    reasons: list[RiskReason] = Field(default_factory=list, max_length=6)
    limitations: list[str] = Field(default_factory=list)
    model: str = ''
    model_assessed: bool = False
    reviewed_source_count: int = 0
    confidence: Literal['low', 'medium', 'high'] = 'low'
    confidence_label: str = '低确信度'
    confidence_explanation: str = '尚未完成证据评估，无法支持稳定判断。'
    confidence_dimensions: list[dict] = Field(default_factory=list)
    review_impact: str = '用户评价尚未完成逐条评估。'
    cashflow_impact: str = '未完成基于材料的收支情景评估。'


class Analysis(Strict):
    analysis_id: str
    company_id: str
    generated_at: str
    evidence_as_of: str
    mode: str
    fallback: bool
    coverage_status: str
    identity: IdentityCandidate
    summary: str
    changes: list[Change]
    questions: list[str]
    unknowns: list[str]
    comparables: list[dict] = Field(default_factory=list)
    sources: list[Evidence]
    trace: list[Step]
    criteria: dict
    counter_search_status: str
    counter_source_ids: list[str]
    agent_status: str
    indicators: list[Indicator]
    agent_framework: str = 'LangGraph'
    agent_model_used: bool = False
    agent_rounds: int = 0
    risk: RiskAssessment = Field(default_factory=RiskAssessment)
    source_stats: dict = Field(default_factory=dict)
    reviews: ReviewAssessment = Field(default_factory=ReviewAssessment)
    cashflow: CashflowAssessment = Field(default_factory=CashflowAssessment)
