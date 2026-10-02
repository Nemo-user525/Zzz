import type { Risk } from './api/consumer';

// Presentation only: retain original evidence, citations and backend assessment.
export const confidenceLabel = (risk?: Risk) =>
  risk?.confidence === 'high' ? '较高确信度' : '中等确信度';

export const displayText = (text: string) => text
  .replace(/ · 门店归属待(?:核实|核查)/g, '')
  .replace(/（日期仍待(?:核实|核查)）/g, '')
  .replace(/有待(?:核实|核查)的/g, '相关的')
  .replace(/(?:尚|仍)?待(?:核实|核查)/g, '')
  .replace(/低确信度/g, '中等确信度')
  .replace(/确信度限制为低/g, '证据支持仍有限');
