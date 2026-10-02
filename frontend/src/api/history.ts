export type ResearchCompany = { id: string; name: string; ticker: string; industry: string; cohort?: string };
export type HistoricalFact = { raw_value?: string | null; raw_unit?: string | null; table_column?: string | null; id: string; category: string; field: string; value: unknown; document_id: string; evidence_ids: string[]; excerpt: string; page: number; published_at: string; available_at: string; verification_status: string; reviewer_type: string; reviewed_at: string; affected_entity: string; period_end: string | null; scope: string | null; unit: string | null; audited: boolean | null };
export type Snapshot = { company: ResearchCompany; as_of: string; dataset_version: string; facts: HistoricalFact[]; timeline: { id: string; assertion_id: string; stage: string; occurred_at: string | null; effective_at: string | null; affected_entity: string }[]; documents: { id: string; title: string; published_at: string; verification_status: string }[]; coverage: { visible_document_count: number; supported_assertion_count: number; latest_visible_publication: string | null }; limitations: string[] };
export type Outcomes = { as_of: string; window_end: string; observation_status: string; outcomes: { id: string; stage: string; confirmed_at: string; occurred_at: string | null; document_id: string; page: number; excerpt: string; affected_entity: string }[]; limitations: string[] };
export type Match = { id: string; status: string; candidate_count: number; matches: { company_id: string; name: string; distance: number }[]; excluded: { company_id: string; name: string; reasons: string[] }[]; limitations: string[] };
export type Discovery = { status: string; query: string; companies: { code: string; zwjc: string; orgId: string }[]; announcements: { announcement_id: string; title: string; url: string; published_at: string; short_name: string }[]; external_search_links: { title: string; url: string }[]; limitations: string[] };
export type ResearchSource = { id: string; title: string; url: string; sha256: string; published_at: string; fetched_at: string; extraction_status: string; verification_status: string; integrity_status: string; local_available: boolean };
export type Quality = { entities: number; documents: number; supported_documents: number; parsed_documents: number; assertion_statuses: Record<string, number>; events: number; outcome_statuses: Record<string, number>; human_reviewed: number; dataset_version: string; last_fetched_at: string | null; last_reviewed_at: string | null; limitations: string[] };

export async function historyRequest<T>(path: string, signal?: AbortSignal, body?: unknown): Promise<T> {
  try {
    const response = await fetch('/api/v2' + path, {signal: signal ?? AbortSignal.timeout(15000), ...(body ? {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)} : {})});
    const data = await response.json().catch(() => null);
    if (!response.ok || data === null) throw new Error(data?.message || `接口失败（${response.status}），请确认本地后端运行并重试`);
    return data as T;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    if (e instanceof TypeError || (e as Error).name === 'TimeoutError') throw new Error('本地 API 无法连接或请求超时，请运行 start.ps1 -SkipInstall 后重试');
    throw e;
  }
}
export const localPdf = (id: string, page = 1) => '/api/v2/sources/' + encodeURIComponent(id) + '/viewer?page=' + page;
