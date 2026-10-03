import { useEffect, useRef, useState } from 'react';
import { qccApi, type QccResult, type QccStatus } from './api/qcc';
import { historyRequest, type Discovery, type ResearchCompany } from './api/history';
import { PublicFinancials } from './PublicFinancials';
import type {Subject} from './assessment';
import './company-search.css';

export function CompanySearch({companies, onSelect, onSearch, onAssess}: {companies: ResearchCompany[]; onSelect: (company: ResearchCompany) => void; onSearch: () => void; onAssess?: (subject:Subject|null) => void}) {
  const [status, setStatus] = useState<QccStatus | null>(null);
  const [searched, setSearched] = useState(false);
  const [local, setLocal] = useState<ResearchCompany[]>([]);
  const [localNote, setLocalNote] = useState('');
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [publicNote, setPublicNote] = useState('');
  const [publicPending, setPublicPending] = useState(false);
  const [selected, setSelected] = useState('');
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<QccResult | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    qccApi.status(AbortSignal.any([abort.signal, AbortSignal.timeout(10000)]))
      .then(value => {if (!abort.signal.aborted) setStatus(value);})
      .catch(() => {});
    return () => abort.abort();
  }, []);
  useEffect(() => () => {sequence.current++; active.current?.abort();}, []);
  function edit(value: string) {
    sequence.current++; active.current?.abort(); setPending(false); setPublicPending(false); setQuery(value); setResult(null); setConfirmed(false); setError('');
    setSearched(false); setLocal([]); setDiscovery(null); setSelected(''); setLocalNote(''); setPublicNote(''); onSearch(); onAssess?.(null);
  }
  async function search() {
    const key = query.trim();
    if (key.length < 2 || pending) return;
    const seq = ++sequence.current;
    active.current?.abort(); const abort = new AbortController(); active.current = abort;
    const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(25000)]);
    const current = () => seq === sequence.current && !abort.signal.aborted;
    const cached = companies.filter(c => (c.name + ' ' + c.ticker).toLowerCase().includes(key.toLowerCase()));
    setLocal(cached); setSearched(true); setSelected(''); setDiscovery(null); setLocalNote(''); setPublicNote('');
    setPending(true); setPublicPending(true); setResult(null); setConfirmed(false); onSearch(); onAssess?.(null);
    setError(status?.configured ? '正在补充工商与信用资料…' : '企查查工商、处罚、纳税和质押资料暂未启用；仍可查询已入库企业与公开公告。');
    const tasks = [
      historyRequest<{items: ResearchCompany[]}>('/companies?query=' + encodeURIComponent(key) + '&page_size=100', signal)
        .then(data => {if (current()) setLocal(data.items);})
        .catch(() => {if (current()) setLocalNote(cached.length ? '企业目录更新失败，以下为已载入的匹配结果。' : '已入库企业查询失败，请稍后重试。');}),
      historyRequest<Discovery>('/discovery?query=' + encodeURIComponent(key), signal)
        .then(data => {if (current()) setDiscovery(data);})
        .catch(() => {if (current()) setPublicNote('公开公告查询失败或超时，请稍后重试，或前往官方公示系统核验。');})
        .finally(() => {if (current()) setPublicPending(false);}),
    ];
    if (status?.configured) tasks.push(qccApi.lookup(key, signal)
      .then(value => {if (current()) {setResult(value); setError('');}})
      .catch(e => {if (current()) setError(e instanceof TypeError || (e as Error).name === 'TimeoutError' ? '企查查连接失败或超时，请稍后重试。' : (e as Error).message);}));
    await Promise.allSettled(tasks);
    if (current()) setPending(false);
  }
  return <section className="company-search company-search-inline" aria-label="企业统一查询">
    <form className="company-query" onSubmit={e => {e.preventDefault(); void search();}}>
      <label htmlFor="qcc-company-query">企业关键词、名称片段、证券代码或信用代码</label>
      <div><input id="qcc-company-query" value={query} maxLength={80} placeholder="试试：美的、紫晶、mdjt，或已入库行业关键词" onChange={e => edit(e.target.value)} autoComplete="off"/><button className="primary" disabled={pending || query.trim().length < 2}>{pending ? '正在查询…' : '查询企业'}</button></div>
      <small>支持名称片段、拼音及已入库行业关键词。先选对企业，再做四维评估；未覆盖的非上市企业需工商核验。信用代码匹配需企查查服务。</small>
    </form>
    {searched && <div className="company-query-results">
      <section aria-label="已入库匹配"><h2>已入库企业</h2>
        {local.map(c => <div className="local-company-match" key={c.id}><div><strong>{c.name}</strong><small>{c.ticker} · {c.industry}</small></div><div>{onAssess&&<button className="ghost" onClick={()=>onAssess({name:c.name,ticker:c.ticker,identity:'catalog'})}>评估 {c.name}</button>}<button className="secondary" onClick={() => {setSelected(c.id); onSelect(c);}}>{selected === c.id ? '已选择' : '查看历史资料'}</button></div></div>)}
        {!local.length && <p>{pending ? '正在匹配已入库资料…' : '历史库未找到匹配企业，可查看下方公开候选或核验企业工商资料。'}</p>}
        {localNote && <p role="status">{localNote}</p>}
      </section>
      {publicPending && <p role="status">公开公告仍在查询，已入库结果可以先查看。</p>}
      {publicNote && <p role="status">{publicNote}</p>}
      {discovery && <section aria-label="公开公告候选"><h2>{{success:'公开公告候选',empty:'公开索引未找到匹配资料',failed:'公开公告查询未完成',blocked:'公开来源访问受限'}[discovery.status] || '公开查询结果'}</h2>
        {discovery.companies.map(c => <p key={c.orgId + c.code}>{c.zwjc} · {c.code}<span className="chip">候选主体</span>{onAssess&&<button className="ghost" onClick={()=>onAssess({name:c.zwjc,ticker:c.code,identity:'catalog'})}>评估 {c.zwjc}</button>}</p>)}
        <details open={discovery.companies.length===0}><summary>展开 {discovery.announcements.length} 条公告候选</summary>{discovery.announcements.map(a => <p key={a.announcement_id}><small>{a.published_at} · {a.short_name}</small><a href={a.url} target="_blank" rel="noreferrer">{a.title} ↗</a></p>)}</details>
        {(discovery.companies.length > 0 || discovery.announcements.length > 0) && <small>公开候选尚未核验，不会自动成为历史证据。</small>}
        <details><summary>查看公开来源与查询范围</summary>{discovery.limitations.map((v,i) => <p key={i}>{v}</p>)}{discovery.external_search_links.map(l => <p key={l.url}><a href={l.url} target="_blank" rel="noreferrer">{l.title} ↗</a></p>)}</details>
      </section>}
      {!publicPending && (!discovery || discovery.status !== 'success') && <p><a href="https://www.gsxt.gov.cn/" target="_blank" rel="noreferrer">前往国家企业信用信息公示系统核验 ↗</a></p>}
      {error && <p className="qcc-inline-note" role="status">{error}</p>}
      <PublicFinancials key={sequence.current} candidates={[
        ...local.map(c => ({ticker:c.ticker,name:c.name})),
        ...(discovery?.companies || []).map(c => ({ticker:c.code,name:c.zwjc})),
        ...(/^\d{6}$/.test(query.trim()) ? [{ticker:query.trim(),name:'证券代码 ' + query.trim()}] : []),
      ]} onAssess={onAssess ? financials=>onAssess({name:financials.groups.flatMap(g=>g.records)[0]?.company_name||financials.security_code,ticker:financials.security_code.slice(0,6),identity:'catalog',financials,...(confirmed&&result?.company.stock_number===financials.security_code.slice(0,6)?{qcc:result}:{})}) : undefined}/>
      {onAssess&&!pending&&!local.length&&!(discovery?.companies.length)&&<div className="qcc-notice"><p>未找到匹配主体。可先填写企业名称开展资料核对，主体身份会标为待核实。</p><button className="ghost" onClick={()=>onAssess({name:query.trim(),ticker:'',identity:'manual'})}>以“{query.trim()}”补充评估资料</button></div>}
      <details className="source-coverage"><summary>其他平台核验与尚需补齐的资料</summary>
        <p>以下为官方人工核验入口，尚未自动读取其记录。请用企业全称或统一社会信用代码核对同一主体。</p>
        <ul><li><a href="https://www.gsxt.gov.cn/" target="_blank" rel="noreferrer">国家企业信用信息公示系统 ↗</a>：工商、年报、经营异常与行政处罚公示。</li>
          <li><a href="https://www.creditchina.gov.cn/" target="_blank" rel="noreferrer">信用中国 ↗</a>：行政许可、行政处罚及信用公示。</li>
          <li><a href="https://zxgk.court.gov.cn/" target="_blank" rel="noreferrer">中国执行信息公开网 ↗</a>：执行及失信线索，可能需要人工验证。</li></ul>
        <h3>还需企业提供</h3><p>未来 3–6 个月房租、工资、货款与还贷计划；前两大客户收入占比；关键客户关系与核心技术的人员依赖。缺少这些资料时，不生成“现金充裕”或“客户分散”的结论。</p>
        <p>当前来源分别覆盖：巨潮公开公告、东方财富上市公司财报、企查查工商与信用（{status?.configured ? '密钥已配置，是否可用以查询结果为准' : '待配置密钥与权限'}）。多个平台转引同一公告，不代表多份独立证据。</p>
      </details>
    </div>}
    {result && <section className="qcc-identity" aria-label="查询到的企业">
      <span className="section-index">{confirmed ? '已确认交易主体' : '请确认是这家企业'}</span><h2>{result.company.name}</h2>
      <dl><div><dt>统一社会信用代码</dt><dd>{result.company.credit_code || '接口未提供，请对照营业执照'}</dd></div><div><dt>登记状态</dt><dd>{result.company.registration_status || '未提供'}</dd></div><div><dt>法定代表人</dt><dd>{result.company.legal_representative || '未提供'}</dd></div><div><dt>注册资本</dt><dd>{result.company.registered_capital || '未提供'}</dd></div><div><dt>注册地址</dt><dd>{result.company.address || '未提供'}</dd></div></dl>
      <details><summary>更多工商基本资料</summary><dl>
        <div><dt>企业类型</dt><dd>{result.company.enterprise_type || '未提供'}</dd></div>
        <div><dt>成立日期</dt><dd>{result.company.established_at || '未提供'}</dd></div>
        <div><dt>实缴资本</dt><dd>{result.company.paid_in_capital || '未提供'}</dd></div>
        <div><dt>核准日期</dt><dd>{result.company.approval_date || '未提供'}</dd></div>
        <div><dt>证券代码</dt><dd>{result.company.stock_number || '未提供'}</dd></div>
        <div><dt>经营范围</dt><dd>{result.company.business_scope || '未提供'}</dd></div>
      </dl></details>
      {!confirmed && <button className="primary" onClick={() => {setConfirmed(true);onAssess?.({name:result.company.name,ticker:result.company.stock_number||'',identity:'qcc',qcc:result});}}>确认这家企业，查看资料 →</button>}
      <small>获取时间：{new Date(result.retrieved_at).toLocaleString('zh-CN', {timeZone:'Asia/Shanghai', hour12:false})}（北京时间） · 企业更新时间：{result.company.updated_at || '接口未提供'}</small>
    </section>}
    {result && confirmed && <section className="qcc-records" aria-label="企业信用与经营资料"><h2>有哪些事项需要进一步核对？</h2><p>按需展开资料，先看原始记录，再判断与本次合作的关系。</p>
      {result.groups.map(group => <details key={group.id}><summary><span>{group.title}</span><span>{!group.available ? '接口未提供' : group.returned_count === 0 ? '本次未返回记录' : `本次返回 ${group.returned_count} 条`}</span></summary>
        {!group.available ? <p>该字段未返回，暂时无法判断覆盖情况。</p> : group.returned_count === 0 ? <p>本次未返回记录，不代表已核实不存在相关事项。</p> : <>{group.records.map((record,i) => <dl key={i}>{record.map((field,j) => <div key={j}><dt>{field.label}</dt><dd>{field.value || '未提供'}</dd></div>)}</dl>)}{group.records.length === 0 && <p>接口返回了记录，但缺少可展示的字段，请补充核验。</p>}</>}
      </details>)}
      <div className="qcc-notice"><h3>下一步：补齐企业内部资料</h3><p>可用现金与未来 3–6 个月刚性支出、前两大客户收入占比、客户关系及核心技术的人员依赖，需要企业补充。</p></div>
      <details><summary>查看数据来源与覆盖范围</summary><p><a href="https://openapi.qcc.com/dataApi/736" target="_blank" rel="noreferrer">企查查企业风险扫描 · 接口 736</a></p>{result.limitations.map(v => <p key={v}>{v}</p>)}</details>
    </section>}
  </section>;
}
