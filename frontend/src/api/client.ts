import type {Company,CompanyReport,Comparison,Health,IntegrationStatus,InvestigationInput,InvestigationResult,LegalEntity,Place,Region,RiskEvent,SimulationInput,SimulationResult,Source,UseCases} from './types';
async function request<T>(path:string, options?:RequestInit):Promise<T>{
  const r=await fetch('/api'+path,{headers:{'Content-Type':'application/json'},...options});
  const value=await r.json().catch(()=>null);
  if(!r.ok) throw new Error(value?.message||`请求失败 ${r.status}`);
  return value as T;
}
export const api={
  integrations:()=>request<IntegrationStatus>('/integrations'),
  regions:(parent:string)=>request<{provider:string;parent:string;regions:Region[]}>('/regions?parent='+encodeURIComponent(parent)),
  places:(keyword:string,regionCode:string,street:string)=>request<{provider:string;places:Place[];street_filter_note:string;identity_note:string}>('/places?'+new URLSearchParams({keyword,region_code:regionCode,street})),
  legalEntities:(keyword:string)=>request<{provider:string;companies:LegalEntity[];identity_note:string}>('/legal-entities?keyword='+encodeURIComponent(keyword)),
  companyReport:(companyKeyword:string,place:Place)=>request<CompanyReport>('/company-report',{method:'POST',body:JSON.stringify({company_keyword:companyKeyword,place:{id:place.id,name:place.name,address:place.address}})}),
  investigate:(input:InvestigationInput,signal?:AbortSignal)=>request<InvestigationResult>('/investigations',{method:'POST',body:JSON.stringify(input),signal}),
  health:()=>request<Health>('/health'),
  useCases:()=>request<UseCases>('/use-cases'),
  demo:()=>request<SimulationInput>('/demo-scenario'),
  company:(id:string)=>request<Company>('/companies/'+encodeURIComponent(id)),
  events:(id:string)=>request<RiskEvent[]>('/companies/'+encodeURIComponent(id)+'/risk-events'),
  source:(id:string)=>request<Source>('/sources/'+encodeURIComponent(id)),
  simulate:(input:SimulationInput)=>request<SimulationResult>('/simulations',{method:'POST',body:JSON.stringify(input)}),
  compare:(input:SimulationInput)=>request<Comparison>('/compare-scenarios',{method:'POST',body:JSON.stringify(input)})
};
