export type Cashflow = {day:number; amount_yuan:number; label:string};
export type Shipment = {day:number; fraction:number};
export type SimulationInput = {
  company_id:string; opening_cash_yuan:number; safety_floor_yuan:number; order_amount_yuan:number;
  gross_margin_rate:number|null; direct_cost_yuan:number|null; prepayment_rate:number;
  payment_term_days:number; delay_days:number; other_net_cashflows:Cashflow[];
  shipments:Shipment[]|null; cost_day:number; horizon_days:number;
};
export type SimulationResult = {
  cash_curve:{day:number;balance_yuan:number}[]; minimum_balance_yuan:number; minimum_day:number;
  first_breach_day:number|null; shortfall_yuan:number; final_payment_day:number;
  outside_view_payment:boolean; assumptions:string[]; formula_breakdown:string[];
  evidence_event_ids:string[]; data_labels:string[];
};
export type Comparison = {variants:{name:string;result:SimulationResult}[];opportunity_cost_yuan:number;explanation:string};
export type Health = {status:string;database_ready:boolean;verified_company_count:number;verified_source_count:number;as_of:string;llm_mode:string};
export type Financial = {field:string;value_yuan:number|null;period:string;unit:string;source_id:string;scope:string;audited:boolean;excerpt:string;verification_status:string};
export type Company = {id:string;legal_name:string;short_name:string;ticker:string;industry:string;coverage:string;updated_at:string;uscc:string|null;listed:boolean;financials:Financial[];unknowns:string[]};
export type RiskEvent = {id:string;company_id:string;affected_entity:string;type:string;event_date:string;stage:string;amount_yuan:number|null;status:string;verification_status:string;source_ids:string[];explanation:string};
export type Source = {id:string;type:string;institution:string;title:string;url:string;notice_number:string|null;published_at:string;fetched_at:string;page:number;sha256:string;accessible:boolean;excerpt:string};
export type UseCase = {id:string;target_user:string;decision_goal:string;headline:string;subtitle:string;primary_action:string;output_template:{title:string;sections:{id:string;title:string;fields:string[]}[]}};
export type UseCases = {default_use_case_id:string;use_cases:UseCase[]};

export type InvestigationInput = {
  query: string;
  city: string;
  intent: 'initial_purchase' | 'add_value' | 'renewal' | 'look_around';
  amount_yuan: number | null;
  service_duration_months: number | null;
};
export type WebLead = {
  id: string; title: string; url: string; snippet: string; published_at: string | null;
  search_query: string; provider: string; verification_status: 'search_lead';
};
export type InvestigationResult = {
  query: string; city: string; queried_at: string;
  status: 'leads_found' | 'no_results' | 'source_unavailable';
  identity_status: 'unconfirmed';
  leads: WebLead[];
  candidates: {name: string; source_ids: string[]; status: 'unconfirmed'}[];
  coverage: {name: string; status: 'queried' | 'unavailable' | 'not_connected'; detail: string}[];
  trace: {step: string; detail: string; at: string}[];
  failures: {query: string; message: string}[];
  training_model: {status: 'unavailable'; version: null; detail: string};
  agent: {status: 'not_connected'; detail: string};
};

export type Region = {name:string;adcode:string;level:string};
export type Place = {
  id:string;name:string;address:string;province:string;city:string;district:string;
  adcode:string;location:string;type:string;provider:string;
};
export type LegalEntity = {
  key_no:string;name:string;credit_code:string;address:string;status:string;start_date:string;provider:string;
};
export type CompanyReport = {
  provider:string;queried_at:string;order_number:string;company_name:string;credit_code:string;
  data:Record<string,unknown>;coverage_note:string;selected_place:{id:string;name:string;address:string};
  identity_status:'user_selected_unverified';identity_note:string;
};
export type IntegrationStatus = {amap:{configured:boolean;provider:string};qcc:{configured:boolean;provider:string}};
