// Contract fixture; the live UI uses client.ts and the API.
import type { SimulationInput, SimulationResult } from './types';
export const demoInput: SimulationInput = {
  company_id: 'halo-688173', opening_cash_yuan: 3000000,
  safety_floor_yuan: 200000, order_amount_yuan: 1000000,
  gross_margin_rate: 0.18, direct_cost_yuan: null, prepayment_rate: 0,
  payment_term_days: 90, delay_days: 30, cost_day: 10, horizon_days: 90,
  shipments: [{ day: 10, fraction: 1 }],
  other_net_cashflows: [{day:75, amount_yuan:-2150000, label:'其他业务预计净流出（虚构）'}]
};
export const mockResult: SimulationResult = {
  cash_curve: [{day:0,balance_yuan:3000000},{day:10,balance_yuan:2180000},{day:75,balance_yuan:30000},{day:90,balance_yuan:30000}],
  minimum_balance_yuan:30000, minimum_day:75, first_breach_day:75, shortfall_yuan:170000,
  final_payment_day:130, outside_view_payment:true,
  assumptions:['延付30天为用户假设'], formula_breakdown:['3000000 - 820000 - 2150000 = 30000'],
  evidence_event_ids:['event-zinitix-management'], data_labels:['公开事实','情景假设','计算结果']
};
