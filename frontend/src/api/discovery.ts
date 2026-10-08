export type Region={name:string;adcode:string;level:string};
export type Place={id:string;name:string;address:string;province:string;city:string;district:string;adcode:string;location:string;type:string;provider:string};
export type LegalEntity={key_no:string;name:string;credit_code:string;address:string;status:string;start_date:string;provider:string};
export type ReportSection={title:string;tool:string;status:'returned'|'failed';scan_count?:number;message?:string;data?:Record<string,unknown>};
export type ReportAssessment={level:'low'|'medium'|'high';label:string;title:string;recommendation:string;reasons:{text:string;tool:string}[];scope:string;rule_version:string};
export type CompanyReport={provider:string;queried_at:string;order_number:string;company_name:string;credit_code:string;data:Record<string,unknown>;risk_scan?:Record<string,unknown>|null;sections?:ReportSection[];failed_sections?:string[];assessment?:ReportAssessment;coverage_note:string;selected_place:{id:string;name:string;address:string};identity_status:'user_selected_unverified';identity_note:string};
export type IntegrationStatus={amap:{configured:boolean;provider:string};qcc:{configured:boolean;provider:string}};

async function request<T>(path:string,options?:RequestInit):Promise<T>{
  const response=await fetch('/api'+path,{headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),...options});
  const value=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(value?.detail?.message||value?.message||`请求失败 ${response.status}`);
  return value as T;
}
export const discoveryApi={
  storeReviews:(place:Place,signal?:AbortSignal)=>request<import('./consumer').Discovery>('/store-review-discovery',{method:'POST',signal,body:JSON.stringify({id:place.id,name:place.name,address:place.address,city:place.city,district:place.district})}),
  integrations:()=>request<IntegrationStatus>('/integrations'),
  regions:(parent:string)=>request<{provider:string;parent:string;regions:Region[]}>('/regions?parent='+encodeURIComponent(parent)),
  places:(keyword:string,regionCode:string,street:string)=>request<{provider:string;places:Place[];street_filter_note:string;identity_note:string}>('/places?'+new URLSearchParams({keyword,region_code:regionCode,street})),
  legalEntities:(keyword:string)=>request<{provider:string;companies:LegalEntity[];search_note?:string;identity_note:string}>('/legal-entities?keyword='+encodeURIComponent(keyword)),
  companyReport:(companyKeyword:string,place:Place)=>request<CompanyReport>('/company-report',{method:'POST',signal:AbortSignal.timeout(150000),body:JSON.stringify({company_keyword:companyKeyword,place:{id:place.id,name:place.name,address:place.address}})}),
};
