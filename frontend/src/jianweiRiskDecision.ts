import type { RiskAnalysis } from './api/consumer';

export type RiskDecision = {
  level: 'low' | 'medium' | 'high';
  label: string;
  action: string;
  explanation: string;
  basis: 'company_evidence' | 'information_gap';
  scope: string;
};

const labels = { low: '低风险', medium: '中风险', high: '高风险' };
const actions = {
  low: '可继续考虑，优先选择按次或短期购买。',
  medium: '建议控制预付金额，选择短期或按次支付。',
  high: '建议暂缓大额预付，先确认现有服务和退款安排。',
};
const paymentDecisionScope = '预付决策建议，不表示企业已发生经营问题';

/** Present a supplied assessment without converting missing evidence into safety. */
export function riskDecision(
  report?: RiskAnalysis | null,
  sourceCount = report?.sources.length ?? 0,
  identityKnown = true,
): RiskDecision {
  const risk = report?.risk;
  if (identityKnown && risk && ['low', 'medium', 'high'].includes(risk.level)) {
    const level = risk.level as RiskDecision['level'];
    const informationGap = level === 'medium' && risk.decision_basis === 'information_gap';
    return {
      level,
      label: labels[level],
      action: actions[level],
      explanation: informationGap
        ? risk.decision_explanation || risk.explanation || '按当前决策条件判断为中风险，建议小额、短期或按次购买；这不表示公司存在不良经营事件。'
        : risk.explanation || risk.decision_explanation || '综合本次检索的正面、负面及回应材料作出判断。',
      basis: informationGap ? 'information_gap' : 'company_evidence',
      scope: informationGap ? paymentDecisionScope : '基于本次检索资料的风险初判',
    };
  }

  // Older saved reports and interrupted analyses still get a concrete next step.
  // This is a payment decision under limited coverage, not an allegation.
  return {
    level: 'medium',
    label: labels.medium,
    action: actions.medium,
    explanation: !identityKnown
      ? '当前材料涉及品牌或同名主体，建议先选择实际收款公司，再决定预付安排。'
      : sourceCount === 0
        ? '本次尚无可用资料，建议按中风险采取保守的付款策略。'
        : '当前资料覆盖有限，尚不足以支持低风险判断，建议按中风险采取保守的付款策略。',
    basis: 'information_gap',
    scope: paymentDecisionScope,
  };
}
