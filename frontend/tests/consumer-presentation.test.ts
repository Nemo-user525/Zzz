import { expect, it } from 'vitest';
import { confidenceLabel, displayText } from '../src/consumerPresentation';
import type { Risk } from '../src/api/consumer';

it('uses two display bands without changing the underlying assessment', () => {
  const risk: Risk = {level:'undetermined', label:'证据不足', explanation:'缺少资料', reasons:[], limitations:[], model:'', model_assessed:false, reviewed_source_count:0, confidence:'low'};
  expect(confidenceLabel(risk)).toBe('中等确信度');
  expect(risk.confidence).toBe('low');
  expect(confidenceLabel({...risk, confidence:'medium'})).toBe('中等确信度');
  expect(confidenceLabel({...risk, confidence:'high'})).toBe('较高确信度');
  expect(confidenceLabel()).toBe('中等确信度');
});

it('removes pending labels from generated display text', () => {
  expect(displayText('3 条待核实材料')).toBe('3 条材料');
  expect(displayText('已选研究对象 · 门店归属待核查')).toBe('已选研究对象');
  expect(displayText('当前材料存在有待核实的服务线索。')).toBe('当前材料存在相关的服务线索。');
});
