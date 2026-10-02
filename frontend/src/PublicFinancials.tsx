import { useEffect, useRef, useState } from 'react';
import { loadPublicFinancials, securityCode, type PublicFinancials as Financials } from './api/publicFinancials';

export function PublicFinancials({candidates,onAssess}: {candidates: {ticker: string; name: string}[];onAssess?:(data:Financials)=>void}) {
  const [data, setData] = useState<Financials | null>(null);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  const generation = useRef(0);
  useEffect(() => () => {generation.current++; active.current?.abort();}, []);
  const seen = new Set<string>();
  const matches = candidates.flatMap(c => {
    const code = securityCode(c.ticker);
    if (!code || seen.has(code)) return [];
    seen.add(code); return [{...c, code}];
  });
  async function load(code: string) {
    const seq = ++generation.current;
    active.current?.abort(); const abort = new AbortController(); active.current = abort;
    setPending(code); setData(null); setError('');
    try {
      const result = await loadPublicFinancials(code, AbortSignal.any([abort.signal, AbortSignal.timeout(18000)]));
      if (generation.current === seq) setData(result);
    } catch (e) {
      if (generation.current === seq && !abort.signal.aborted) setError((e as Error).name === 'TimeoutError' || e instanceof TypeError ? '公开财报连接失败或超时，请稍后重试。' : (e as Error).message);
    } finally {if (generation.current === seq) setPending('');}
  }
  return <section className="public-financials" aria-label="补充公开财报"><h2>再看公开财报</h2>
    <p>确认证券代码对应的企业，再补充财务资料。来源：东方财富公开财务分析。</p>
    {matches.map(c => <button className="ghost" key={c.code} disabled={pending === c.code} onClick={() => void load(c.code)}>{pending === c.code ? '正在获取三张财报…' : `查看 ${c.name}（${c.ticker}）的公开财报`}</button>)}
    {!matches.length && <p>暂未匹配到可查询财报的 A 股证券代码。非上市企业请补充财务报表及现金支出计划。</p>}
    {error && <p role="alert">{error}</p>}
    {data && <div className="public-financial-result">
      <h3>{data.groups.flatMap(g => g.records)[0]?.company_name || data.security_code} · 公开财报</h3>
      {onAssess&&<button className="primary" onClick={()=>onAssess(data)}>用这些资料生成四维评估 →</button>}
      <small>{data.security_code} · 获取时间 {new Date(data.retrieved_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})}（北京时间）{data.cached ? ' · 5 分钟内缓存' : ''}</small>
      <p>{data.status === 'success' ? '已取得三张表，可按需展开。' : data.status === 'partial' ? '部分报表未能取得，已返回的报表仍可查看。' : data.status === 'empty' ? '本次未返回公开财报，不能据此判断经营状况。' : '本次财报查询未完成，可重试或打开来源页面。'}</p>
      {data.groups.map(g => <details className="financial-table" key={g.id}><summary>{g.title} · {g.status === 'success' ? `${g.records.length} 个报告期` : g.status === 'empty' ? '未返回' : '查询失败'}</summary>
        {g.message && <p>{g.message}</p>}
        {g.records.map((r,i) => <div key={r.report_date + ':' + i}><h4>{r.report_name || r.report_date}</h4><small>报告期末 {r.report_date} · 公开日 {r.published_at?.slice(0,10) || '未提供'} · 更新 {r.updated_at?.slice(0,10) || '未提供'} · 币种 {r.currency || '未提供'}</small>
          <dl>{r.metrics.map(m => <div key={m.id}><dt>{m.label}</dt><dd>{m.value === null ? '未提供' : m.unit === 'percent' ? m.value.toLocaleString('zh-CN') + '%' : m.value.toLocaleString('zh-CN',{maximumFractionDigits:2}) + (r.currency === 'CNY' ? ' 元' : r.currency ? ' ' + r.currency : '（币种未提供）')}</dd></div>)}</dl>
        </div>)}
      </details>)}
      <p><a href={data.source_url} target="_blank" rel="noreferrer">打开东方财富来源页面核对 ↗</a></p>
      <details><summary>查看财报口径与缺失项</summary>{data.limitations.map(l => <p key={l}>{l}</p>)}</details>
    </div>}
  </section>;
}
