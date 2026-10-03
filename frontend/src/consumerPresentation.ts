import type { Risk } from './api/consumer';

// Presentation only: retain original evidence, citations and backend assessment.
export const confidenceLabel = (risk?: Risk) =>
  risk?.confidence === 'high' ? '较高确信度' : '中等确信度';

export const riskHeadline = (risk?: Risk) => {
  const level = risk?.decision_level || (risk?.level !== 'undetermined' ? risk?.level : 'medium');
  return {
    low: '低风险，可以信任！！',
    medium: '中等风险，慎重！！！',
    high: '高风险，千万别买！！',
  }[level || 'medium'];
};

export const riskPlainExplanation = (risk?: Risk) => {
  const level = risk?.decision_level || risk?.level;
  if (risk?.decision_basis === 'information_gap' || !risk?.model_assessed)
    return '这次能核对的资料还不够，暂时说不清这家公司到底稳不稳。先少付钱，把门店是谁开的、退款怎么退问清楚。';
  if (level === 'low')
    return '目前查到的公司资料能互相对上，也没有发现需要马上警惕的严重问题。办卡前仍要看清合同和退款办法。';
  if (level === 'high')
    return '查到的严重问题有多处资料支持。现在先别预付，等对方把问题解释清楚、拿出处理结果再考虑。';
  return '查到一些要问清楚的问题。先别急着充大额的钱，把问题、合同和退款办法核对好再决定。';
};

export const displayText = (text: string) => text
  .replace(/ · 门店归属待(?:核实|核查)/g, '')
  .replace(/（日期仍待(?:核实|核查)）/g, '')
  .replace(/有待(?:核实|核查)的/g, '相关的')
  .replace(/(?:尚|仍)?待(?:核实|核查)/g, '')
  .replace(/低确信度/g, '中等确信度')
  .replace(/确信度限制为低/g, '证据支持仍有限');
