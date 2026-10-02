import { ApiError } from './client';
export type Evidence = {id:string; title:string; url:string; publisher:string; excerpt:string; published_at:string|null; date_semantics:string; fetched_at:string; verification_status:'search_excerpt'|'page_text'|'provider_response'; channel:string; purpose:string; page_status:string; cached:boolean; scope?:'selected_entity'|'brand_context'};
export type Candidate = {id:string; name:string; basis:string; source_ids:string[]; relationship_status:string};
export type Step = {action:string; status:string; detail:string; source_ids:string[]};
export type Criteria = {status:string; sample_count:number; human_reviewed_count?:number; limitation:string; algorithm?:string; evaluation?:string; trained_at?:string; matches:{category:string; review_focus?:string; examples:{url:string; page:number; document_id:string}[]}[]};
export type Discovery = {investigation_id:string; query:string; location:string; generated_at:string; mode:'live_search'|'cached'|'unavailable'; candidates:Candidate[]; sources:Evidence[]; trace:Step[]; unknowns:string[]};
export type Conditions = {intent:'initial_purchase'|'top_up'|'renewal'|'explore'; service_category:'fitness'|'education'|'beauty'|'eldercare'|'other'; amount_yuan:number|null; service_duration_months:number|null};
export type Finding = {indicator_id:string; explanation:string; question:string; citations:{source_id:string; quote:string}[]};
export type Indicator = {id:string; label:string; status:string; value:string; explanation:string; source_ids:string[]; missing:string[]; agent_findings:Finding[]};
export type Analysis = {analysis_id:string; company_id:string; generated_at:string; evidence_as_of:string; mode:string; fallback:boolean; coverage_status:string; identity:Candidate; summary:string; changes:{id:string; title:string; fact_text:string; source_ids:string[]; consumer_relevance:string; event_date:string|null; published_at:string|null; stage:string; missing_evidence:string[]; interpretations:{text:string; supporting_source_ids:string[]; counter_source_ids:string[]}[]}[]; questions:string[]; unknowns:string[]; sources:Evidence[]; trace:Step[]; criteria:Criteria; counter_search_status:string; counter_source_ids:string[]; agent_status:string; indicators:Indicator[]; agent_framework:string; agent_model_used:boolean; agent_rounds:number};
export type Capabilities = {search:string; qcc_configured:boolean; llm_mode:string; agent_framework:string; agent_enabled:boolean; xiaohongshu:string; criteria:Criteria};
async function request<T>(path:string, body?:unknown, signal?:AbortSignal):Promise<T> {
  const timeout = AbortSignal.timeout(190000);
  const response = await fetch('/api/consumer' + path, {method:body ? 'POST' : 'GET', headers:{'Content-Type':'application/json'}, body:body ? JSON.stringify(body) : undefined, signal:signal ? AbortSignal.any([signal,timeout]) : timeout});
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new ApiError(data?.code || 'research_error', data?.message || `查询失败（${response.status}），请重试`);
  return data;
}
export const consumerApi = {
  capabilities:(signal?:AbortSignal) => request<Capabilities>('/capabilities',undefined,signal),
  discover:(query:string,location:string,signal?:AbortSignal) => request<Discovery>('/discovery',{query,location},signal),
  analyse:(investigation_id:string,candidate_id:string,conditions:Conditions,signal?:AbortSignal) => request<Analysis>('/analyses',{investigation_id,candidate_id,...conditions},signal),
};
