import type {Company,Comparison,Health,RiskEvent,SimulationInput,SimulationResult,Source,UseCases} from './types';
async function request<T>(path:string, options?:RequestInit):Promise<T>{
  const r=await fetch('/api'+path,{headers:{'Content-Type':'application/json'},...options});
  const value=await r.json();
  if(!r.ok) throw new Error(value.message||`请求失败 ${r.status}`);
  return value as T;
}
export const api={
  health:()=>request<Health>('/health'),
  useCases:()=>request<UseCases>('/use-cases'),
  demo:()=>request<SimulationInput>('/demo-scenario'),
  company:(id:string)=>request<Company>('/companies/'+encodeURIComponent(id)),
  events:(id:string)=>request<RiskEvent[]>('/companies/'+encodeURIComponent(id)+'/risk-events'),
  source:(id:string)=>request<Source>('/sources/'+encodeURIComponent(id)),
  simulate:(input:SimulationInput)=>request<SimulationResult>('/simulations',{method:'POST',body:JSON.stringify(input)}),
  compare:(input:SimulationInput)=>request<Comparison>('/compare-scenarios',{method:'POST',body:JSON.stringify(input)})
};
