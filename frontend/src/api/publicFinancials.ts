export type PublicFinancials = {
  provider: string; status: string; security_code: string; retrieved_at: string; cached: boolean; source_url: string;
  groups: {id: string; title: string; status: string; message: string; records: {
    company_name: string | null; report_date: string; report_name: string | null; published_at: string | null;
    updated_at: string | null; currency: string | null;
    metrics: {id: string; label: string; value: number | null; unit: string}[];
  }[]}[];
  limitations: string[];
};
export function securityCode(ticker: string): string | null {
  if (/^[03]\d{5}$/.test(ticker)) return ticker + '.SZ';
  if (/^6\d{5}$/.test(ticker)) return ticker + '.SH';
  if (/^(?:[48]\d{5}|92\d{4})$/.test(ticker)) return ticker + '.BJ';
  return null;
}
export async function loadPublicFinancials(code: string, signal: AbortSignal): Promise<PublicFinancials> {
  const response = await fetch('/api/integrations/public-financials?code=' + encodeURIComponent(code), {signal});
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(data?.message || '公开财报暂时无法访问，请稍后重试。');
  return data;
}
