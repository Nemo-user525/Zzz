import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { JianweiResearchResults } from '../src/JianweiResearchResults';
import type { Evidence, RiskAnalysis } from '../src/api/consumer';

const evidence: Evidence = { id: 'source-1', title: '营业公告', url: 'https://example.com/notice', publisher: '测试来源', excerpt: '材料原文', published_at: null, date_semantics: '日期待核实', fetched_at: '2026-10-03T00:00:00Z', verification_status: 'page_text', channel: 'public_web', purpose: '核对变化', page_status: '已读取正文', cached: false };
const response: RiskAnalysis = {
  analysis_id: 'analysis-1', company_id: 'company-1', generated_at: '2026-10-03T01:00:00Z', evidence_as_of: '2026-10-03T00:00:00Z', mode: 'live_search_rules', fallback: false, coverage_status: 'partial',
  identity: { id: 'company-1', name: '测试公司', basis: '用户确认', source_ids: ['source-1'], relationship_status: '门店归属待核实' },
  summary: '取得 3 条待核实材料，当前低确信度。', sources: [evidence], trace: [], unknowns: ['门店实际收款方未知'], criteria: { status: 'not_trained', sample_count: 0, matches: [], limitation: '没有训练依据' },
  counter_search_status: '回应检索已完成，仍需核实。', counter_source_ids: [], agent_status: 'completed', agent_framework: 'LangGraph', agent_model_used: false, agent_rounds: 0,
  questions: ['退款安排是否适用于本次合同？'],
  indicators: [{ id: 'refund', label: '退款与履约', status: 'partial', value: '1 条相关线索', explanation: '退款说明仍待核实。', source_ids: ['source-1', 'missing-source'], missing: ['缺少合同原件'], agent_findings: [{ indicator_id: 'refund', explanation: '仅有部分材料，不能确定覆盖全部门店。', question: '是否覆盖这家门店？', citations: [{ source_id: 'source-1', quote: '原文提及分批处理退款。' }] }] }],
  changes: [{ id: 'change-1', title: '服务承接线索', fact_text: '公告提到服务将由另一主体承接。', source_ids: ['source-1'], consumer_relevance: '需核对合同能否继续履行。', event_date: null, published_at: '2026-10-01', stage: '尚待联合核验', missing_evidence: ['缺少承接协议'], interpretations: [{ text: '可能是常规经营调整，不能单凭主体变化推断停业。', supporting_source_ids: ['source-1'], counter_source_ids: ['missing-counter'] }] }],
  risk: { level: 'undetermined', label: '证据不足', explanation: '资料不足以形成企业风险结论。', decision_level: 'medium', decision_label: '先核对再决定', decision_basis: 'information_gap', decision_explanation: '主要因为信息缺口，建议补充查证。', reasons: [{ explanation: '尚未找到合同原件。', direction: 'uncertainty', citations: [{ source_id: 'missing-reason', quote: '该引用对应来源未返回。' }] }], limitations: ['低确信度，不构成付款保证。'], model: '', model_assessed: false, reviewed_source_count: 1, confidence: 'low', confidence_explanation: '原文与门店关系待核实。', confidence_dimensions: [{ label: '主体归属', value: '待核实' }], review_impact: '评价待核实，低确信度。', cashflow_impact: '收支资料待核实，确信度限制为低。' },
  reviews: { status: 'completed', collected_count: 1, reviewed_count: 1, independent_content_count: 1, counts: { unclear: 1 }, observations: [{ source_id: 'source-1', kind: 'review', sentiment: 'unclear', summary: '评价提到退款，仍待核实。', quote: '用户原始评价。', scope: 'brand_context', duplicate_of: null }], limitation: '单条评价不能代表整体。' },
  cashflow: { mode: 'sensitivity_only', unit: '指数', horizon_months: 9, baseline: { description: '假设基线', period: '无实际期间' }, facts: [], driver_source_ids: [], limitations: ['不代表未来预测。'], scenarios: [{ name: '测试情景', inflow_change_pct: -10, outflow_change_pct: 5, assumption: '仅用于演示条件。', cumulative_net_min: -20, cumulative_net_max: 10, months: [{ month: 9, inflow: 90, outflow_min: 90, outflow_max: 105, net_min: -15, net_max: 0 }] }] },
};

afterEach(cleanup);

it('preserves backend uncertainty and low confidence across summary, risk, reviews and cashflow', () => {
  render(<JianweiResearchResults report={response} showSources={vi.fn()} />);
  expect(screen.getByText(response.summary)).toBeTruthy();
  expect(screen.getByRole('heading', { name: '低确信度' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: '中等确信度' })).toBeNull();
  expect(screen.getByText(response.risk!.confidence_explanation!)).toBeTruthy();
  expect(screen.getByText(response.risk!.review_impact!)).toBeTruthy();
  expect(screen.getByText(response.risk!.cashflow_impact!)).toBeTruthy();
  expect(screen.getByText(response.reviews!.observations[0].summary)).toBeTruthy();
  expect(screen.getByText(response.risk!.limitations[0])).toBeTruthy();
});

it('opens only supplied source records and explicitly marks unavailable citations', () => {
  const showSources = vi.fn();
  render(<JianweiResearchResults report={response} showSources={showSources} />);
  const indicators = screen.getByRole('region', { name: '分项调查结果' });
  fireEvent.click(within(indicators).getByRole('button', { name: '查看依据 · 1 条 ↗' }));
  expect(showSources).toHaveBeenCalledWith([evidence]);
  expect(within(indicators).getByText('1 条引用来源未返回，暂不可核对')).toBeTruthy();
  const assessment = screen.getByRole('region', { name: '决策提示与判断依据' });
  expect(within(assessment).queryByRole('button')).toBeNull();
  expect(within(assessment).getByText('1 条引用来源未返回，暂不可核对')).toBeTruthy();
  const changes = screen.getByRole('region', { name: '变化与相反解释' });
  expect(within(changes).queryByRole('button', { name: /查看相反依据/ })).toBeNull();
  expect(within(changes).getByText(response.changes[0].interpretations[0].text)).toBeTruthy();
  expect(within(changes).getByText('缺少承接协议')).toBeTruthy();
});

it('uses the response horizon for cashflow table headers and the monthly formula', () => {
  render(<JianweiResearchResults report={response} showSources={vi.fn()} />);
  expect(screen.getByRole('columnheader', { name: '第 9 月收款变化' })).toBeTruthy();
  expect(screen.getByRole('columnheader', { name: '第 9 月支出变化' })).toBeTruthy();
  expect(screen.getByRole('columnheader', { name: '9 个月累计收支差额' })).toBeTruthy();
  expect(screen.getByText(/收款变化率×月份÷9/)).toBeTruthy();
  expect(screen.queryByText(/第 6 月收款变化|6 个月累计收支差额|月份÷6/)).toBeNull();
});

it('shows missing assessments as unavailable instead of assigning a confidence or a safe result', () => {
  render(<JianweiResearchResults report={{ ...response, risk: undefined, reviews: undefined, cashflow: undefined, indicators: [], changes: [], questions: [] }} showSources={vi.fn()} />);
  expect(screen.getByText('本次未返回决策评估，不能据此认定风险高低。')).toBeTruthy();
  expect(screen.queryByRole('heading', { name: /确信度/ })).toBeNull();
  expect(screen.getByText('本次未形成可展示的变化记录，不代表企业没有变化。')).toBeTruthy();
  expect(screen.getByText('本次未返回进一步核对的问题。')).toBeTruthy();
});
