import { useEffect, useRef, useState } from 'react';
import { Drawer } from './Drawer';
import { historyRequest as request, localPdf, type ResearchCompany, type Snapshot, type Outcomes, type Match, type Discovery, type ResearchSource, type HistoricalFact, type Quality } from './api/history';
import './history.css';

const statusText: Record<string, string> = {source_supported: '原文支持 · agent 核对', candidate: '候选资料 · 未核验', human_reviewed: '人工复核', observed_positive: '窗口内有公开确认结果', insufficient_coverage: '覆盖不足，不能作为无事件样本', right_censored: '观察期未满', empty: '索引未找到匹配资料', failed: '联网查询失败', blocked: '来源访问受限', success: '已取得候选索引'};
const fieldNames: Record<string, string> = {total_assets_yuan: '总资产', revenue_yuan: '营业收入', operating_cashflow_yuan: '经营活动现金流净额'};
type TextMatches = {items: {document_id: string; title: string; page: number; snippet: string}[]; limitations: string[]};

export function HistoryWorkspace({onSimulate}: {onSimulate: (snapshot: Snapshot) => void}) {
  const [companies, setCompanies] = useState<ResearchCompany[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [asOf, setAsOf] = useState('2023-04-23');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [quality, setQuality] = useState<Quality | null>(null);
  const [outcomes, setOutcomes] = useState<Outcomes | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [query, setQuery] = useState('');
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [actionPending, setActionPending] = useState('');
  const [searching, setSearching] = useState(false);
  const [retry, setRetry] = useState(0);
  const [source, setSource] = useState<ResearchSource | null>(null);
  const [fact, setFact] = useState<HistoricalFact | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [textQuery, setTextQuery] = useState('');
  const [textMatches, setTextMatches] = useState<TextMatches | null>(null);
  const generation = useRef(0);
  const searchGeneration = useRef(0);
  const sourceGeneration = useRef(0);
  const renderedContext = useRef('');
  const context = companyId + ':' + asOf;
  // Hide an old result on the very render where company/date changes.
  const visible = renderedContext.current === context ? snapshot : null;

  useEffect(() => {
    const abort = new AbortController();
    Promise.all([request<{items: ResearchCompany[]}>('/companies?page_size=100', abort.signal), request<Quality>('/dataset/quality', abort.signal)])
      .then(([list, q]) => {setCompanies(list.items); setQuality(q); setCompanyId(id => id || list.items.find(c => c.ticker === '688086')?.id || list.items[0]?.id || '');})
      .catch(e => {if (e.name !== 'AbortError') setError(e.message);});
    return () => abort.abort();
  }, [retry]);

  useEffect(() => {
    const seq = ++generation.current;
    const abort = new AbortController();
    setSnapshot(null); setOutcomes(null); setMatch(null); setSourceOpen(false); setActionPending(''); setError('');
    setTextMatches(null);
    if (!companyId || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {setPending(false); return;}
    setPending(true);
    request<Snapshot>('/companies/' + encodeURIComponent(companyId) + '/snapshot?as_of=' + asOf, abort.signal)
      .then(data => {if (seq === generation.current) {renderedContext.current = context; setSnapshot(data);}})
      .catch(e => {if (seq === generation.current && e.name !== 'AbortError') setError(e.message);})
      .finally(() => {if (seq === generation.current) setPending(false);});
    return () => {abort.abort(); generation.current++; sourceGeneration.current++;};
  }, [companyId, asOf, retry]);

  useEffect(() => () => {searchGeneration.current++; sourceGeneration.current++;}, []);

  async function search() {
    if (query.trim().length < 2) {setError('请输入至少两个字符的企业名称或证券代码'); return;}
    const seq = ++searchGeneration.current;
    setSearching(true); setDiscovery(null); setError('');
    try {const data = await request<Discovery>('/discovery?query=' + encodeURIComponent(query.trim()), AbortSignal.timeout(45000)); if (seq === searchGeneration.current) setDiscovery(data);}
    catch(e) {if (seq === searchGeneration.current) setError('联网查询未完成：' + (e as Error).message);}
    finally {if (seq === searchGeneration.current) setSearching(false);}
  }
  async function reveal(kind: 'outcomes' | 'comparison') {
    const seq = generation.current;
    setActionPending(kind); setError('');
    try {
      if (kind === 'outcomes') {const data = await request<Outcomes>('/companies/' + companyId + '/outcomes?as_of=' + asOf + '&window_days=180'); if (seq === generation.current) setOutcomes(data);}
      else {const data = await request<Match>('/comparisons', undefined, {company_id: companyId, as_of: asOf, window_days: 180}); if (seq === generation.current) setMatch(data);}
    } catch(e) {if (seq === generation.current) setError((e as Error).message);}
    finally {if (seq === generation.current) setActionPending('');}
  }
  async function showSource(id: string, f: HistoricalFact | null = null) {
    const seq = ++sourceGeneration.current;
    setSource(null); setFact(f); setSourceOpen(true); setError('');
    try {const data = await request<ResearchSource>('/sources/' + encodeURIComponent(id)); if (seq === sourceGeneration.current) setSource(data);}
    catch(e) {if (seq === sourceGeneration.current) setError((e as Error).message);}
  }
  async function searchLocal() {
    const seq = generation.current;
    setActionPending('text'); setTextMatches(null); setError('');
    try {
      const data = await request<TextMatches>('/search?query=' + encodeURIComponent(textQuery.trim()) + '&as_of=' + asOf + '&company_id=' + encodeURIComponent(companyId));
      if (seq === generation.current) setTextMatches(data);
    } catch(e) {if (seq === generation.current) setError((e as Error).message);}
    finally {if (seq === generation.current) setActionPending('');}
  }
  return <section className="research" aria-label="企业检索与历史回放">
    <div className="research-heading"><div><span className="section-index">公开证据 → 历史回放 → 本方现金</span><h1>把时间拨回当时，核对后来发生了什么</h1><p>联网发现的资料先进入候选；有原文支持的断言才进入历史证据。</p></div></div>
    <form className="research-search" onSubmit={e => {e.preventDefault(); void search();}}>
      <label htmlFor="company-query">输入任意企业名称或证券代码</label><input id="company-query" value={query} maxLength={80} placeholder="例如：美的集团、688086，或待查非上市企业" onChange={e => {setQuery(e.target.value); searchGeneration.current++; setSearching(false); setDiscovery(null);}}/>
      <button className="primary" disabled={searching || query.trim().length < 2}>{searching ? '正在联网检索…' : '联网查找资料'}</button>
      <small>联网查询巨潮公告目录；非上市或未覆盖企业提供公开检索入口，不生成虚假风险结论。</small>
    </form>
    {discovery && <section className="research-block" aria-label="联网候选"><h2>{statusText[discovery.status] || discovery.status}</h2><p>以下均为待核验线索，尚未加入历史事实库。</p>
      {discovery.companies.map(c => <span className="outlined" key={c.orgId}>{c.zwjc} · {c.code}</span>)}
      {discovery.announcements.map(a => <p key={a.announcement_id}><span>{a.published_at} · {a.short_name} </span><a href={a.url} target="_blank" rel="noreferrer">{a.title} ↗</a></p>)}
      {discovery.external_search_links.map(l => <a className="source-link" key={l.url} href={l.url} target="_blank" rel="noreferrer">{l.title} ↗</a>)}<p>{discovery.limitations.join('；')}</p>
    </section>}
    <div className="research-toolbar"><label>已入库企业<select aria-label="历史企业" value={companyId} onChange={e => setCompanyId(e.target.value)}>{companies.map(c => <option key={c.id} value={c.id}>{c.name} · {c.ticker}</option>)}</select></label>
      <label>当时可用时点<input aria-label="历史日期" type="date" value={asOf} onChange={e => setAsOf(e.target.value)}/></label>
      <button className="ghost" onClick={() => setAsOf(new Date().toLocaleDateString('sv-SE', {timeZone: 'Asia/Shanghai'}))}>当前已入库资料</button>
      <button className="ghost" onClick={() => {setCompanyId(companies.find(c => c.ticker === '688086')?.id || companies[0]?.id || ''); setAsOf('2023-04-23'); setOutcomes(null); setMatch(null); setDiscovery(null); setTextMatches(null); setTextQuery(''); setQuery(''); searchGeneration.current++; setSearching(false);}}>重置历史案例</button>
    </div>
    {error && <p className="error-banner" role="alert">{error} <button className="ghost" onClick={() => setRetry(x => x+1)}>重试载入</button></p>}
    {pending && <p role="status">正在读取此企业与日期的证据，旧结果已隐藏…</p>}
    {!companies.length && !pending && <p>本地历史库尚未导入。请按 INGEST_RUNBOOK 运行 restore、fetch、extract、validate。</p>}
    {visible && <div className="research-columns">
      <section className="research-block"><span className="section-index">01 / 当时可用证据</span><h2>{visible.company.name}</h2><p>{asOf} 零时前可用 · {visible.company.ticker}</p><p className="source-notice">公开日仅精确到日期的资料，从次日零时起进入回放。快照名称来自当时可用原文；未核对时只显示代码，历史别名尚未完整重建。</p>
        <p>{visible.coverage.visible_document_count} 份当时已公开候选文档 · {visible.facts.length} 条原文支持断言</p>
        {visible.facts.length === 0 && <p className="unknown-box">此时点尚无完成核对的断言。下方候选文档可查原文；不能据此认定无风险。</p>}
        {visible.facts.map(f => <article className="historical-fact" key={f.id}><span className="chip">{statusText[f.verification_status] || f.verification_status}</span><h3>{fieldNames[f.field] || f.field}</h3>{f.category === 'financial' && <p><b>{f.value == null ? '未披露' : Number(f.value).toLocaleString('zh-CN', {maximumFractionDigits: 2}) + ' 人民币元'}</b> · {f.audited == null ? '审计状态未核对' : f.audited ? '经审计' : '未经审计'}</p>}{f.raw_value && <p>原文 {f.raw_value} {f.raw_unit} · {f.table_column}</p>}<p>主体：{f.affected_entity}</p>{visible.timeline.filter(t => t.assertion_id === f.id).map(t => <p key={t.id}>阶段：{t.stage} · 发生 {t.occurred_at || '未确定'} · 生效 {t.effective_at || '未确定'}</p>)}<blockquote>{f.excerpt}</blockquote><small>公开 {f.published_at} · 第 {f.page} 页 · {f.period_end ? '报告期末 ' + f.period_end : ''} {f.unit || ''} {f.scope || ''}</small><button className="source-link" onClick={() => void showSource(f.document_id, f)}>查看原文、页码与哈希 ↗</button></article>)}
        <form onSubmit={e => {e.preventDefault(); void searchLocal();}}><label>在此企业与时点的本地原文中检索<input aria-label="本地全文关键词" disabled={actionPending === 'text'} value={textQuery} maxLength={80} onChange={e => {setTextQuery(e.target.value); setTextMatches(null);}} placeholder="至少两个字，例如：终止上市"/></label><button className="ghost" disabled={!!actionPending || textQuery.trim().length < 2}>检索本地原文</button></form>
        {textMatches && <div className="unknown-box text-search-results" tabIndex={0} aria-label="本地原文检索结果"><p>{textMatches.items.length} 处候选命中（尚未核验）</p>{textMatches.items.map(m => <p key={m.document_id+':'+m.page}>{m.snippet}<a href={localPdf(m.document_id,m.page)} target="_blank" rel="noreferrer">{m.title} · 第 {m.page} 页</a></p>)}<small>{textMatches.limitations.join('；')}</small></div>}
        <details><summary>当时已公开的文档索引（候选不等于事实）</summary>{visible.documents.map(d => <p key={d.id}>{d.published_at} <button className="source-link" onClick={() => void showSource(d.id)}>{d.title}</button></p>)}</details>
      </section>
      <section className="research-block"><span className="section-index">02 / 后续结果与对照</span><h2>先看当时，再展开后来</h2><p>后续 180 天独立查询，结果不进入左侧的历史证据。</p><button className="primary" disabled={!!actionPending} onClick={() => void reveal('outcomes')}>展开后续结果</button>
        {actionPending && <p role="status">正在查询…</p>}
        {outcomes && <div className="outcome-area"><h3>{statusText[outcomes.observation_status] || outcomes.observation_status}</h3><small>窗口截止 {outcomes.window_end}</small>{outcomes.outcomes.map(o => <article key={o.id}><h3>{o.stage}</h3><p>公开确认 {o.confirmed_at} · 实际发生 {o.occurred_at || '未确定'}</p><p>主体：{o.affected_entity}</p><blockquote>{o.excerpt}</blockquote><a href={localPdf(o.document_id, o.page)} target="_blank" rel="noreferrer">打开本地原文第 {o.page} 页 ↗</a></article>)}<p>{outcomes.limitations.join('；')}</p></div>}
        <button className="ghost" disabled={!!actionPending} onClick={() => void reveal('comparison')}>检查同类公司对照</button>
        {match && <div className="unknown-box"><h3>{match.status === 'matched' ? '符合预设规则的对照' : '未找到合格对照'}</h3><p>已检查 {match.candidate_count} 家候选。规则使用当时可见行业、规模和经营现金流。</p>{match.matches.map(m => <p key={m.company_id}>{m.name} · 规模距离 {m.distance.toFixed(3)} <button className="source-link" onClick={() => setCompanyId(m.company_id)}>核对此公司当时证据</button></p>)}<details><summary>查看逐公司排除原因</summary>{match.excluded.map(e => <p key={e.company_id}>{e.name}：{e.reasons.join('；')}</p>)}</details><p>{match.limitations.join('；')}</p></div>}
      </section>
      <section className="research-block"><span className="section-index">03 / 交易条件</span><h2>把核对结果带回这笔订单</h2><p>公开事件不能推出客户付款日期。进入推演后，订单、现金和延付天数均使用明确标记的虚构演示输入。</p><button className="primary" onClick={() => onSimulate(visible)}>用这家企业推演演示订单 →</button><p>交易对手：{visible.company.name}</p><p>本方期初现金及订单金额不来自该企业财报。</p><h3>资料边界</h3>{visible.limitations.map(x => <p key={x}>{x}</p>)}<small>历史快照版本 {visible.dataset_version}</small></section>
    </div>}
    {quality && <details className="research-quality"><summary>查看整个资料库覆盖（当前统计，不是历史时点统计）</summary><p>{quality.entities} 家主体 · {quality.documents} 个文档版本 · {quality.parsed_documents} 份已解析 · {Object.values(quality.assertion_statuses).reduce((a,b) => a+b,0)} 条断言 · {quality.human_reviewed} 条具名人工复核</p><p>采集时间 {quality.last_fetched_at} · agent 核对时间 {quality.last_reviewed_at}</p><p>{quality.limitations.join('；')}</p></details>}
    {sourceOpen && <Drawer viewKey="history-source" onClose={() => {sourceGeneration.current++; setSourceOpen(false);}}>{source ? <><h2>{source.title}</h2><p>{source.published_at} 发布 · {source.fetched_at} 获取</p><p>{statusText[source.verification_status] || source.verification_status}，不代表文档全部内容均已验证。</p>{fact && <><h3>本条引用第 {fact.page} 页</h3><blockquote>{fact.excerpt}</blockquote><p>复核者类型：{fact.reviewer_type} · {fact.reviewed_at}</p></>}<p>SHA-256</p><code className="hash-text">{source.sha256}</code><p>提取状态 {source.extraction_status} · 本地原文 {source.local_available ? '已缓存' : '缺失'}</p>{source.local_available && <a className="external" href={localPdf(source.id, fact?.page)} target="_blank" rel="noreferrer">打开本地 PDF（无外网可用）↗</a>}<a className="source-link" href={source.url + '#page=' + (fact?.page || 1)} target="_blank" rel="noreferrer">打开官方原文（需要外网）↗</a></> : <p role="status">正在读取来源；失败时可关闭后重试。</p>}</Drawer>}
  </section>;
}
