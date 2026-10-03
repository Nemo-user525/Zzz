import { describe, expect, it } from 'vitest';
import type { Evidence, Risk, RiskAnalysis } from '../src/api/consumer';
import { riskDecision } from '../src/jianweiRiskDecision';

const source: Evidence = {
  id: 'operating-report', title: '经营资料', url: 'https://example.com/report',
  publisher: '资料来源', excerpt: '经营表现连续改善，服务持续正常。',
  published_at: '2026-09-30', fetched_at: '2026-10-03T00:00:00Z',
  date_semantics: '发布日期', verification_status: 'search_excerpt',
  channel: 'public_web', purpose: '分析经营表现', page_status: '搜索摘要', cached: false,
  scope: 'selected_entity',
};

function assessment(level: Risk['level'], overrides: Partial<Risk> = {}): Risk {
  return {
    level, label: '来源中的风险标签', explanation: '现有资料显示经营表现连续改善。',
    reasons: [], limitations: [], model: '', model_assessed: false,
    reviewed_source_count: 1, confidence: 'low', ...overrides,
  };
}

function report(risk?: Risk, overrides: Partial<RiskAnalysis> = {}): RiskAnalysis {
  return {
    analysis_id: 'assessment-a', company_id: 'company-a',
    generated_at: '2026-10-03T00:00:00Z', evidence_as_of: '2026-10-03T00:00:00Z',
    mode: 'live_search_rules', fallback: true, coverage_status: 'partial',
    identity: { id: 'company-a', name: '测试企业 A', basis: '用户选择', source_ids: [source.id], relationship_status: 'selected_entity' },
    summary: '现有资料分析结果', changes: [], questions: [], unknowns: [],
    sources: [source], trace: [], criteria: { status: 'not_trained', sample_count: 0, limitation: '', matches: [] },
    counter_search_status: 'completed', counter_source_ids: [], agent_status: 'completed',
    indicators: [], agent_framework: '', agent_model_used: false, agent_rounds: 0,
    risk, ...overrides,
  };
}

describe('riskDecision', () => {
  it('keeps a positive assessment low despite excerpt-only sources, low confidence and fallback analysis', () => {
    const input = report(assessment('low'));
    const original = structuredClone(input);
    const decision = riskDecision(input);

    expect(decision).toMatchObject({ level: 'low', label: '低风险', basis: 'company_evidence' });
    expect(decision.explanation).toBe(input.risk!.explanation);
    expect(decision.action).toContain('可继续考虑');
    expect(input).toEqual(original);
  });

  it('keeps an adverse assessment high when analysis ran in fallback mode', () => {
    const explanation = '现有资料出现持续停课和退款延迟记录。';
    const decision = riskDecision(report(assessment('high', { explanation })));

    expect(decision).toMatchObject({ level: 'high', label: '高风险', basis: 'company_evidence', explanation });
    expect(decision.action).toContain('暂缓大额预付');
  });

  it('preserves a backend medium payment decision without recasting background-only materials as adverse company evidence', () => {
    const explanation = '现有材料提供企业背景，建议按中风险控制预付金额；不表示公司存在不良经营事件。';
    const decision = riskDecision(report(assessment('medium', {
      explanation: '已取得企业背景资料。', decision_basis: 'information_gap',
      decision_level: 'medium', decision_explanation: explanation,
      reasons: [{ direction: 'context', explanation: '材料介绍企业业务范围。', citations: [{ source_id: source.id, quote: source.excerpt }] }],
    })));

    expect(decision).toMatchObject({ level: 'medium', label: '中风险', basis: 'information_gap', explanation });
    expect(decision.action).toContain('控制预付金额');
    expect(decision.scope).toContain('不表示企业已发生经营问题');
  });

  it('supplies a non-allegation explanation when a backend information-gap decision has no explanation', () => {
    const decision = riskDecision(report(assessment('medium', {
      explanation: '', decision_explanation: '', decision_basis: 'information_gap',
    })));

    expect(decision.basis).toBe('information_gap');
    expect(decision.explanation).toContain('不表示公司存在不良经营事件');
    expect(decision.action).toContain('控制预付金额');
  });

  it.each(['low', 'high'] as const)('keeps an actual %s company assessment despite a legacy default information-gap field', level => {
    const decision = riskDecision(report(assessment(level, { decision_basis: 'information_gap' })));

    expect(decision).toMatchObject({ level, basis: 'company_evidence' });
    expect(decision.scope).toBe('基于本次检索资料的风险初判');
  });

  it.each([
    ['missing report', undefined],
    ['null report', null],
    ['report without a risk assessment', report()],
    ['report without sources or a risk assessment', report(undefined, { sources: [] })],
  ] as const)('gives a conservative payment decision for %s without alleging company misconduct', (_name, input) => {
    const decision = riskDecision(input);

    expect(decision).toMatchObject({ level: 'medium', label: '中风险', basis: 'information_gap' });
    expect(decision.action).toContain('控制预付金额');
    expect(decision.scope).toContain('不表示企业已发生经营问题');
    expect(decision.explanation).not.toMatch(/企业已|经营异常|出现停业|存在欺诈/);
  });

  it('does not promote an undetermined legacy assessment to low based on a decision_level hint', () => {
    const decision = riskDecision(report(assessment('undetermined', {
      decision_level: 'low', decision_label: '低风险', decision_basis: 'information_gap',
      explanation: '没有可用于判断企业经营状态的资料。',
    })));

    expect(decision).toMatchObject({ level: 'medium', basis: 'information_gap' });
    expect(decision.scope).toContain('不表示企业已发生经营问题');
    expect(decision.action).toContain('控制预付金额');
  });

  it.each(['low', 'high'] as const)('does not attribute a %s assessment to an unidentified company', level => {
    const explanation = '这段判断仅涉及另一个同名主体。';
    const decision = riskDecision(report(assessment(level, { explanation })), 20, false);

    expect(decision).toMatchObject({ level: 'medium', basis: 'information_gap' });
    expect(decision.explanation).toContain('实际收款公司');
    expect(decision.explanation).not.toBe(explanation);
    expect(decision.scope).toContain('不表示企业已发生经营问题');
  });

  it('evaluates separate reports independently instead of carrying an earlier high-risk decision forward', () => {
    const adverse = report(assessment('high', { explanation: '企业 A 出现连续退款延迟记录。' }));
    const positive = report(assessment('low', { explanation: '企业 B 持续公布稳定经营和正向盈利资料。' }), {
      analysis_id: 'assessment-b', company_id: 'company-b',
      identity: { id: 'company-b', name: '测试企业 B', basis: '用户选择', source_ids: [source.id], relationship_status: 'selected_entity' },
    });

    const earlierDecision = riskDecision(adverse);
    const laterDecision = riskDecision(positive);

    expect(earlierDecision.level).toBe('high');
    expect(laterDecision).toMatchObject({ level: 'low', basis: 'company_evidence', explanation: positive.risk!.explanation });
    expect(earlierDecision.explanation).toBe(adverse.risk!.explanation);
    expect(riskDecision(adverse)).toEqual(earlierDecision);
  });
});
