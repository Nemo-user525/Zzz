import type { Conditions, Discovery, Evidence, RiskAnalysis } from './api/consumer';

export const defaultConditions: Conditions = { intent: 'initial_purchase', service_category: 'fitness', amount_yuan: null, service_duration_months: null };
export type VerificationSnapshot = {
  query: string; location: string; conditions: Conditions; discovery: Discovery | null;
  selected: string; confirmation: string; identityUnconfirmed: boolean; report: RiskAnalysis | null;
};
export const emptyVerification: VerificationSnapshot = { query: '', location: '', conditions: defaultConditions, discovery: null, selected: '', confirmation: '', identityUnconfirmed: false, report: null };
export const verificationStorageKey = 'jianwei-verification-v3';
export function readVerification(): VerificationSnapshot {
  try {
    const value = JSON.parse(sessionStorage.getItem(verificationStorageKey) || 'null');
    if (!value || typeof value.query !== 'string' || typeof value.location !== 'string') return emptyVerification;
    const discovery = value.discovery && Array.isArray(value.discovery.candidates) && Array.isArray(value.discovery.sources) && Array.isArray(value.discovery.trace) && Array.isArray(value.discovery.unknowns) ? value.discovery : null;
    const conditions = value.conditions || {};
    const validAmount = typeof conditions.amount_yuan === 'number' && Number.isFinite(conditions.amount_yuan) && conditions.amount_yuan >= 0 && conditions.amount_yuan <= 100000000;
    const validMonths = Number.isInteger(conditions.service_duration_months) && conditions.service_duration_months >= 1 && conditions.service_duration_months <= 120;
    return {
      query: value.query.slice(0, 80), location: value.location.slice(0, 60),
      conditions: { ...defaultConditions, intent: ['initial_purchase', 'top_up', 'renewal', 'explore'].includes(conditions.intent) ? conditions.intent : 'initial_purchase', service_category: ['fitness', 'education', 'beauty', 'eldercare', 'other'].includes(conditions.service_category) ? conditions.service_category : defaultConditions.service_category, amount_yuan: validAmount ? conditions.amount_yuan : null, service_duration_months: validMonths ? conditions.service_duration_months : null },
      discovery, selected: typeof value.selected === 'string' ? value.selected : '', confirmation: typeof value.confirmation === 'string' ? value.confirmation.slice(0, 300) : '',
      identityUnconfirmed: value.identityUnconfirmed === true,
      report: discovery && value.report && value.report.identity?.id === value.selected && Array.isArray(value.report.sources) && Array.isArray(value.report.unknowns) && Array.isArray(value.report.changes) && Array.isArray(value.report.trace) ? value.report : null,
    };
  } catch { return emptyVerification; }
}
export function sourceLabel(source: Evidence) {
  return { search_excerpt: '搜索线索 · 尚未独立核验', page_text: '已读取原文 · 事实仍需核对', provider_response: '接口记录 · 未核对原始公示' }[source.verification_status] || '核验状态未知';
}
export function sourceUrl(value: string) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
export function verificationSources(snapshot: VerificationSnapshot) {
  return [...new Map([...(snapshot.discovery?.sources || []), ...(snapshot.report?.sources || [])].map(source => [source.id, source])).values()];
}
export function questionsFor(conditions: Conditions) {
  const amount = conditions.amount_yuan == null ? '本次预付金额' : `${conditions.amount_yuan.toLocaleString('zh-CN')} 元`;
  const duration = conditions.service_duration_months == null ? '约定服务期' : `${conditions.service_duration_months} 个月服务期`;
  return [
    '这家分店的营业执照、合同抬头和实际收款方是否一致？如不一致，分别由谁履约？',
    conditions.intent === 'renewal' || conditions.intent === 'top_up' ? `原有余额如何与新增的 ${amount} 区分，原合同条件是否继续有效？` : `${amount} 对应哪些服务、次数与限制，能否按次或分期支付？`,
    `在${duration}内，如果停业、迁址或未能提供约定服务，剩余款项如何处理？能否写入合同？`,
  ];
}
export function formatTime(value: string | undefined) {
  if (!value || Number.isNaN(Date.parse(value))) return '未提供';
  return new Date(value).toLocaleString('zh-CN');
}
export function isStale(snapshot: VerificationSnapshot) {
  const generated = snapshot.report?.generated_at || snapshot.discovery?.generated_at;
  return !!generated && Date.now() - Date.parse(generated) > 24 * 60 * 60 * 1000;
}
/** Keep saved cards as complete as the on-screen investigation, including uncertainty. */
function researchText(report: RiskAnalysis) {
  const sourceMap = new Map(report.sources.map(source => [source.id, source]));
  const references = (ids: string[]) => [...new Set(ids)].map(id => {
    const source = sourceMap.get(id);
    return source ? `${source.title}：${sourceUrl(source.url) || '未提供有效链接'}` : `引用 ${id} 未返回，暂不可核对`;
  }).join('\n') || '尚无引用来源';
  const confidence = { low: '低确信度', medium: '中等确信度', high: '较高确信度' };
  const result = ['## 调查分析（线索与评估，尚需核验）', report.summary,
    `分析生成：${report.generated_at}；资料截至：${report.evidence_as_of}`];
  if (report.risk) {
    const risk = report.risk;
    result.push('### 决策提示与判断依据', risk.decision_label || risk.label, risk.decision_explanation || risk.explanation,
      `确信度：${risk.confidence ? confidence[risk.confidence] : risk.confidence_label || '未提供'}。${risk.confidence_explanation || ''}`,
      ...risk.reasons.map(reason => `${reason.explanation}\n${reason.citations.map(citation => `引用：${citation.quote}\n${references([citation.source_id])}`).join('\n')}`),
      ...risk.limitations.map(value => `判断限制：${value}`));
  }
  result.push('### 分项线索', ...report.indicators.map(indicator =>
    `${indicator.label}：${indicator.value}\n${indicator.explanation}\n${references(indicator.source_ids)}\n${indicator.missing.map(value => `仍缺少：${value}`).join('\n')}`),
    '### 变化与相反解释', ...report.changes.map(change =>
      `${change.title}\n${change.fact_text}\n事件日期：${change.event_date || '未核实'}；材料公开日期：${change.published_at || '未核实'}\n${references(change.source_ids)}\n${change.interpretations.map(interpretation => `${interpretation.text}\n支持：${references(interpretation.supporting_source_ids)}\n相反：${references(interpretation.counter_source_ids)}`).join('\n')}\n${change.missing_evidence.map(value => `仍需核对：${value}`).join('\n')}`));
  if (report.reviews) {
    result.push('### 评价与反馈', `收集 ${report.reviews.collected_count} 条；审阅 ${report.reviews.reviewed_count} 条；独立内容 ${report.reviews.independent_content_count} 条。`,
      report.reviews.limitation, ...report.reviews.observations.map(observation => `${observation.summary}\n引用：${observation.quote}\n${references([observation.source_id])}`));
  }
  if (report.cashflow) {
    const cashflow = report.cashflow;
    result.push(`### ${cashflow.horizon_months} 个月收支情景（假设演算）`, `模式：${cashflow.mode === 'evidence_anchored' ? '有资料锚点' : '敏感性演算'}；单位：${cashflow.unit}`,
      ...cashflow.facts.map(fact => `${fact.kind}：${fact.amount_text} ${fact.unit}（${fact.period}）\n${fact.citation.quote}\n${references([fact.citation.source_id])}`),
      ...cashflow.scenarios.map(scenario => `${scenario.name}：${scenario.assumption}\n收入变化 ${scenario.inflow_change_pct}%；支出变化 ${scenario.outflow_change_pct}%；累计净额区间 ${scenario.cumulative_net_min} 至 ${scenario.cumulative_net_max}（${cashflow.unit}）。`),
      ...cashflow.limitations.map(value => `演算限制：${value}`));
  }
  result.push('### 调查后续问题', ...report.questions.map(value => `- ${value}`));
  return result;
}
export function reportText(snapshot: VerificationSnapshot) {
  const sources = verificationSources(snapshot);
  const candidate = snapshot.discovery?.candidates.find(c => c.id === snapshot.selected);
  const identity = snapshot.identityUnconfirmed || !candidate ? '主体未确认' : `用户选择：${candidate.name}（未独立核验门店归属）`;
  const conditions = snapshot.conditions;
  const gaps = [...new Set(['尚未完成门店、合同抬头、收款方的一致性核对。', ...(snapshot.report?.unknowns || snapshot.discovery?.unknowns || [])])];
  return [
    '# 见微 · 初步查证卡', `查询时间：${formatTime(snapshot.report?.generated_at || snapshot.discovery?.generated_at)}`, isStale(snapshot) ? '时效提示：资料已超过 24 小时，建议重新查询。' : '',
    '## 1. 我准备做什么', `门店：${snapshot.query}；位置：${snapshot.location || '未提供'}`, `意图：${{ initial_purchase: '首次办卡', top_up: '追加充值', renewal: '续费', explore: '先了解' }[conditions.intent]}；金额：${conditions.amount_yuan == null ? '未提供' : `${conditions.amount_yuan} 元`}；期限：${conditions.service_duration_months == null ? '未提供' : `${conditions.service_duration_months} 个月`}`,
    '## 2. 经营主体', identity, `用户确认依据：${snapshot.confirmation || '未提供'}`,
    ...(!snapshot.identityUnconfirmed && candidate && snapshot.report?.identity.id === candidate.id ? researchText(snapshot.report) : []),
    '## 3. 已核实事实时间线', '0 条。当前接口未提供完成主体、日期与原文联合核验的事实记录；已读取不等于已核实。',
    '## 4. 其他线索（尚未独立核验）', ...sources.map((source, i) => `${i + 1}. ${source.title}\n${sourceLabel(source)}；${source.scope === 'brand_context' ? '品牌背景，不能归为门店事实' : identity}\n材料日期：${source.published_at || '未知'}（${source.date_semantics}）\n${source.excerpt}\n来源：${sourceUrl(source.url) || '未提供有效原文链接'}\n取得时间：${formatTime(source.fetched_at)}`),
    '## 5. 资料缺口与相反信息', ...gaps.map(gap => `- ${gap}`), snapshot.report?.counter_search_status ? `相反信息检索记录：${snapshot.report.counter_search_status}` : '尚未完成相反信息核对；不能理解为不存在相反信息。',
    '## 6. 付款前最值得问的 3 个问题', ...questionsFor(conditions).map((question, i) => `${i + 1}. ${question}`),
    '## 7. 查证记录', `检索编号：${snapshot.discovery?.investigation_id || '未生成'}；${sources.length} 条去重资料；0 条已核实事实。`,
    ...(snapshot.report?.trace || snapshot.discovery?.trace || []).map(step => `- ${step.action}：${step.status}。${step.detail}`),
    '这是一份查证与提问辅助记录，不提供安全评级、倒闭预测或付款保证。保存的文件不会自动更新。',
  ].filter(Boolean).join('\n\n');
}
