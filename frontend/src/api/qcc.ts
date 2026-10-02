export type QccStatus = {configured: boolean; provider: string; api_code: string};
export type QccResult = {
  provider: string; api_code: string; query: string; retrieved_at: string;
  company: {name: string; credit_code: string | null; registration_status: string | null; legal_representative: string | null; registered_capital: string | null; established_at: string | null; updated_at: string | null; address: string | null; enterprise_type?: string | null; business_scope?: string | null; paid_in_capital?: string | null; approval_date?: string | null; stock_number?: string | null};
  groups: {id: string; title: string; available: boolean; returned_count: number | null; records: {label: string; value: string}[][]}[];
  limitations: string[];
};
async function request<T>(path: string, signal: AbortSignal, query?: string): Promise<T> {
  const response = await fetch('/api/integrations/qcc/' + path, {signal, ...(query !== undefined ? {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({query})} : {})});
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(data?.message || `企业查询服务不可用（${response.status}），请稍后重试。`);
  return data as T;
}
export const qccApi = {
  status: (signal: AbortSignal) => request<QccStatus>('status', signal),
  lookup: (query: string, signal: AbortSignal) => request<QccResult>('lookup', signal, query),
};
