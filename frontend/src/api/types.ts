export type Cashflow = { day: number; amount_yuan: number; label: string };
export type Shipment = { day: number; fraction: number };
export type VerificationStatus =
  | "verified"
  | "conflicted"
  | "unverified"
  | "missing";
export type SimulationInput = {
  company_id: string;
  opening_cash_yuan: number;
  safety_floor_yuan: number;
  order_amount_yuan: number;
  gross_margin_rate: number | null;
  direct_cost_yuan: number | null;
  prepayment_rate: number;
  payment_term_days: number;
  delay_days: number;
  other_net_cashflows: Cashflow[];
  shipments: Shipment[] | null;
  cost_day: number;
  horizon_days: number;
};
// The wire contract permits omitted optional fields; the UI edits a normalized draft.
export type SimulationInputWire = Omit<
  SimulationInput,
  | "gross_margin_rate"
  | "direct_cost_yuan"
  | "shipments"
  | "cost_day"
  | "horizon_days"
> &
  Partial<
    Pick<
      SimulationInput,
      | "gross_margin_rate"
      | "direct_cost_yuan"
      | "shipments"
      | "cost_day"
      | "horizon_days"
    >
  >;
export type SimulationResult = {
  cash_curve: { day: number; balance_yuan: number }[];
  minimum_balance_yuan: number;
  minimum_day: number;
  first_breach_day: number | null;
  shortfall_yuan: number;
  final_payment_day: number;
  outside_view_payment: boolean;
  assumptions: string[];
  formula_breakdown: string[];
  evidence_event_ids: string[];
  data_labels: string[];
};
export type Comparison = {
  variants: { name: string; result: SimulationResult }[];
  opportunity_cost_yuan: number;
  explanation: string;
};
export type Health = {
  status: string;
  database_ready: boolean;
  verified_company_count: number;
  verified_source_count: number;
  as_of: string;
  llm_mode: "offline" | "openai" | "openai_compatible";
};
export type Financial = {
  field: string;
  value_yuan: number | null;
  period: string;
  unit: "CNY";
  source_id: string;
  scope: string;
  audited: boolean;
  excerpt: string;
  verification_status: VerificationStatus;
};
export type Company = {
  id: string;
  legal_name: string;
  short_name: string;
  ticker: string;
  industry: string;
  coverage: string;
  updated_at: string;
  uscc: string | null;
  listed: boolean;
  financials: Financial[];
  unknowns: string[];
};
export type RiskEvent = {
  id: string;
  company_id: string;
  affected_entity: string;
  type: string;
  event_date: string;
  stage: string;
  amount_yuan: number | null;
  status: string;
  verification_status: VerificationStatus;
  source_ids: string[];
  explanation: string;
};
export type Source = {
  id: string;
  type: string;
  institution: string;
  title: string;
  url: string;
  notice_number: string | null;
  published_at: string;
  fetched_at: string;
  page: number;
  sha256: string;
  accessible: boolean;
  excerpt: string;
};
export type UseCase = {
  id: string;
  target_user: string;
  decision_goal: string;
  headline: string;
  subtitle: string;
  primary_action: string;
  output_template: {
    title: string;
    sections: { id: string; title: string; fields: string[] }[];
  };
};
export type UseCases = { default_use_case_id: string; use_cases: UseCase[] };
