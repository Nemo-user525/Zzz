import { ApiError } from './client';
export type Evidence = {id:string; title:string; url:string; publisher:string; excerpt:string; published_at:string|null; date_semantics:string; fetched_at:string; verification_status:'search_excerpt'|'page_text'|'provider_response'; channel:string; purpose:string; page_status:string; cached:boolean; scope?:'selected_entity'|'brand_context'};
export type Candidate = {id:string; name:string; basis:string; source_ids:string[]; relationship_status:string};
export type Step = {action:string; status:string; detail:string; source_ids:string[]};
export type Criteria = {status:string; sample_count:number; human_reviewed_count?:number; limitation:string; algorithm?:string; evaluation?:string; trained_at?:string; matches:{category:string; review_focus?:string; examples:{url:string; page:number; document_id:string}[]}[]};
export type Discovery = {investigation_id:string; query:string; location:string; generated_at:string; mode:'live_search'|'cached'|'unavailable'; candidates:Candidate[]; sources:Evidence[]; trace:Step[]; unknowns:string[]};
export type Conditions = {intent:'initial_purchase'|'top_up'|'renewal'|'explore'; service_category:'fitness'|'education'|'beauty'|'eldercare'|'other'; amount_yuan:number|null; service_duration_months:number|null};
export type Finding = {indicator_id:string; explanation:string; question:string; citations:{source_id:string; quote:string}[]};
export type Indicator = {id:string; label:string; status:string; value:string; explanation:string; source_ids:string[]; missing:string[]; agent_findings:Finding[]};
export type Risk = {decision_level?:'low'|'medium'|'high'; decision_label?:string; decision_basis?:'company_evidence'|'information_gap'; decision_explanation?:string; level:'low'|'medium'|'high'|'undetermined'; label:string; explanation:string; reasons:{explanation:string; direction:string; citations:{source_id:string;quote:string}[]}[]; limitations:string[]; model:string; model_assessed:boolean; reviewed_source_count:number; confidence?:'low'|'medium'|'high'; confidence_label?:string; confidence_explanation?:string; confidence_dimensions?:{label:string;value:string}[]; review_impact?:string; cashflow_impact?:string};
export type Reviews = {status:'not_reviewed'|'completed'; collected_count:number; reviewed_count:number; independent_content_count:number; counts:Record<string,number>; observations:{source_id:string; kind:string; sentiment:string; summary:string; quote:string; scope:string; duplicate_of:string|null}[]; limitation:string};
export type Cashflow = {mode:'evidence_anchored'|'sensitivity_only'; unit:string; horizon_months:number; baseline:{period?:string; description?:string}; facts:{kind:string; amount_text:string;unit:string;period:string;citation:{source_id:string;quote:string}}[]; scenarios:{name:string; inflow_change_pct:number; outflow_change_pct:number; assumption:string; cumulative_net_min:number; cumulative_net_max:number; months:{month:number;inflow:number;outflow_min:number;outflow_max:number;net_min:number;net_max:number}[]}[]; driver_source_ids:string[]; limitations:string[]};
export type Analysis = {analysis_id:string; company_id:string; generated_at:string; evidence_as_of:string; mode:string; fallback:boolean; coverage_status:string; identity:Candidate; summary:string; changes:{id:string; title:string; fact_text:string; source_ids:string[]; consumer_relevance:string; event_date:string|null; published_at:string|null; stage:string; missing_evidence:string[]; interpretations:{text:string; supporting_source_ids:string[]; counter_source_ids:string[]}[]}[]; questions:string[]; unknowns:string[]; sources:Evidence[]; trace:Step[]; criteria:Criteria; counter_search_status:string; counter_source_ids:string[]; agent_status:string; indicators:Indicator[]; agent_framework:string; agent_model_used:boolean; agent_rounds:number};
export type Capabilities = {search:string; qcc_configured:boolean; llm_mode:string; model_name?:string; agent_framework:string; agent_enabled:boolean; xiaohongshu:string; criteria:Criteria};
export type RiskAnalysis = Analysis & {risk?:Risk; source_stats?:Record<string,number>; reviews?:Reviews; cashflow?:Cashflow};
type ProgressHandler = (message: string) => void;
type ResearchJob<T> = {status:string;message:string;result:T|null};
async function request<T>(path:string, body?:unknown, signal?:AbortSignal):Promise<T> {
  try {
    const timeout = AbortSignal.timeout(30000);
    const response = await fetch('/api/consumer' + path, {method:body ? 'POST' : 'GET', cache:'no-store', headers:{'Content-Type':'application/json'}, body:body ? JSON.stringify(body) : undefined, signal:signal ? AbortSignal.any([signal,timeout]) : timeout});
    const data = await response.json().catch(() => null);
    const error = data?.detail || data;
    if (!response.ok || !data) throw new ApiError(error?.code || 'research_error', error?.message || (typeof error === 'string' ? error : `查询失败（${response.status}），请重试`));
    return data;
  } catch(error) {
    if (signal?.aborted) throw new DOMException('Aborted','AbortError');
    if (error instanceof ApiError) throw error;
    throw new ApiError('network_error', '连接暂时中断或响应超时，请重试。当前填写内容已保留。');
  }
}
async function pause(signal?:AbortSignal) {
  await new Promise<void>((resolve,reject)=>{
    const done=()=>{signal?.removeEventListener('abort',abort);resolve();};
    const id=setTimeout(done,1500);
    const abort=()=>{clearTimeout(id);signal?.removeEventListener('abort',abort);reject(new DOMException('Aborted','AbortError'));};
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted) abort();
  });
}
async function runJob<T>(path:string,body:unknown,signal?:AbortSignal,onProgress?:ProgressHandler):Promise<T> {
  const {job_id}=await request<{job_id:string}>(path,body,signal);
  const cancel=()=>{void fetch('/api/consumer/jobs/'+job_id,{method:'DELETE'}).catch(()=>{});};
  signal?.addEventListener('abort',cancel,{once:true});
  const deadline=Date.now()+1800000;
  let failures=0;
  try {
    while(Date.now()<deadline) {
      if(signal?.aborted) throw new DOMException('Aborted','AbortError');
      let job:ResearchJob<T>;
      try {
        job=await request<ResearchJob<T>>('/jobs/'+job_id,undefined,signal);
        failures=0;
      } catch(error) {
        // Retry only progress reads; never create a second investigation for a lost POST.
        if(error instanceof ApiError && error.code==='network_error' && ++failures<=3 && !signal?.aborted) {
          onProgress?.('连接暂时中断，正在重新获取进度…');
          await pause(signal);continue;
        }
        throw error;
      }
      onProgress?.(job.message);
      if(job.status==='completed' && job.result) return job.result;
      if(job.status==='failed'||job.status==='cancelled') throw new Error(job.message);
      await pause(signal);
    }
    throw new Error('调查时间超出上限，请重试');
  } catch(error) {cancel();throw error;}
  finally {signal?.removeEventListener('abort',cancel);}
}
export const consumerApi = {
  capabilities:(signal?:AbortSignal) => request<Capabilities>('/capabilities',undefined,signal),
  discover:(query:string,location:string,signal?:AbortSignal) => runJob<Discovery>('/discovery/jobs',{query,location},signal),
  analyse:(investigation_id:string,candidate_id:string,conditions:Conditions,signal?:AbortSignal,onProgress?:ProgressHandler) => runJob<RiskAnalysis>('/jobs',{investigation_id,candidate_id,...conditions},signal,onProgress),
};
