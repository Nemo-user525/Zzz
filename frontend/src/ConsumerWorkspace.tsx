import { useEffect, useRef, useState } from 'react';
import { api } from './api/client';
import { consumerApi, type Analysis, type Capabilities, type Conditions, type Discovery, type Evidence } from './api/consumer';
import type { UseCase } from './api/types';
import { Drawer } from './Drawer';
import './consumer.css';

const time = (value:string) => new Date(value).toLocaleString('zh-CN');
const modeLabel = (mode:string) => ({live_search_agent:'实时检索 + 智能体解释',live_search_rules:'实时检索 + 规则指标',cached_evidence:'历史资料 · 本次补查失败'}[mode] || mode);
const evidenceLabel = (s:Evidence) => ({page_text:'已读取原文 · 内容待核实',search_excerpt:'搜索摘要 · 未核实',provider_response:'接口返回 · 未核对原始公示'}[s.verification_status]);

export function ConsumerWorkspace() {
  const [profile,setProfile] = useState<UseCase|null>(null);
  const [cap,setCap] = useState<Capabilities|null>(null);
  const [query,setQuery] = useState('');
  const [location,setLocation] = useState('');
  const [discovery,setDiscovery] = useState<Discovery|null>(null);
  const [selected,setSelected] = useState('');
  const [report,setReport] = useState<Analysis|null>(null);
  const [conditions,setConditions] = useState<Conditions>({intent:'initial_purchase',service_category:'fitness',amount_yuan:null,service_duration_months:null});
  const [pending,setPending] = useState<'search'|'analyse'|null>(null);
  const [error,setError] = useState('');
  const [detail,setDetail] = useState<Evidence[]|null>(null);
  const seq = useRef(0);
  const controller = useRef<AbortController|null>(null);
  useEffect(() => {
    let active=true;
    const boot = new AbortController();
    api.useCases().then(x => active && setProfile(x.use_cases.find(p => p.presentation_mode === 'consumer_changes') || null)).catch(() => {});
    consumerApi.capabilities(boot.signal).then(x => active && setCap(x)).catch(() => {});
    return () => {active=false; boot.abort(); controller.current?.abort(); seq.current++;};
  },[]);
  function invalidate(clearSearch=false) {
    seq.current++; controller.current?.abort(); setPending(null); setReport(null); setDetail(null); setError('');
    if (clearSearch) {setDiscovery(null); setSelected('');}
  }
  async function search() {
    invalidate(true);
    const current=seq.current;
    controller.current=new AbortController(); setPending('search');
    try {
      const value=await consumerApi.discover(query.trim(),location.trim(),controller.current.signal);
      if (seq.current===current) setDiscovery(value);
    } catch(e) {if(seq.current===current) setError(e instanceof Error ? e.message : '联网查询失败，请重试');}
    finally {if(seq.current===current) setPending(null);}
  }
  async function analyse() {
    if (!discovery || !selected) return;
    invalidate(); const current=seq.current;
    controller.current=new AbortController(); setPending('analyse');
    try {
      const value=await consumerApi.analyse(discovery.investigation_id,selected,conditions,controller.current.signal);
      if (seq.current===current) setReport(value);
    } catch(e) {if(seq.current===current) setError(e instanceof Error ? e.message : '调查失败，请重试');}
    finally {if(seq.current===current) setPending(null);}
  }
  function sourceButton(ids:string[],label='查看依据') {
    const allSources=[...new Map([...(discovery?.sources||[]),...(report?.sources||[])].map(s=>[s.id,s])).values()];
    const rows=allSources.filter(s => ids.includes(s.id));
    return <button type="button" className="ghost" disabled={!rows.length} onClick={() => setDetail(rows)}>{label}（{rows.length}）</button>;
  }
  function changeCondition<K extends keyof Conditions>(key:K,value:Conditions[K]) {invalidate(); setConditions(c => ({...c,[key]:value}));}
  const trace=report?.trace || discovery?.trace || [];
  return <div className="app-shell consumer-shell">
    <header className="topbar"><div className="brand"><span className="brand-icon">✦</span><div><strong>X-RAY</strong><small>企业变化解释器</small></div></div>
      <nav aria-label="工作区"><a href="?view=history">企业检索与历史回放</a><a href="?view=trade">原交易演示</a></nav></header>
    <main className="consumer-main">
      <section className="consumer-hero"><div className="eyebrow">办卡 · 买课 · 充值 · 续费之前</div>
        <h1>{profile?.headline || '这家店，现在值得长期信任吗？'}</h1>
        <p>{profile?.subtitle || '查清背后的经营主体，看懂近期变化，再决定是否办卡、买课、充值或续费。'}</p>
        <div className="consumer-capabilities"><span>真实联网查询</span><span>{!cap ? '模型状态待确认' : cap.agent_enabled ? 'LangGraph 智能体已配置' : '在线模型未配置 · 可查询真实资料'}</span><span>{!cap ? '企查查状态待确认' : cap.qcc_configured ? '企查查已配置' : '企查查未配置'}</span><span>小红书公开索引</span></div>
      </section>
      <form className="consumer-panel consumer-search" onSubmit={e => {e.preventDefault(); void search();}}>
        <label>门店、品牌或公司名称<input required minLength={2} maxLength={80} value={query} placeholder="输入门店或公司名称，可补充城市、分店位置" onChange={e => {invalidate(true);setQuery(e.target.value);}}/></label>
        <label>城市／门店位置（选填）<input maxLength={60} value={location} placeholder="例如：杭州 西湖区" onChange={e => {invalidate(true);setLocation(e.target.value);}}/></label>
        <button className="consumer-primary" disabled={pending==='search' || query.trim().length<2}>{pending==='search' ? '正在查找经营主体…' : '查找经营主体'}</button>
      </form>
      {error && <p className="consumer-message" role="alert">{error}。未使用样例替代失败结果。</p>}
      {pending && <p role="status" className="consumer-message">{pending==='search' ? '正在查询公开网页和可用企业接口，并识别关键词对应的公司。' : '正在检索新闻、工商与消费者线索，读取原文并核对回应；完整调查最长约三分钟。'}<button className="ghost" onClick={() => invalidate()}>取消</button></p>}
      {discovery && <section className="consumer-panel">
        <div className="consumer-section-head"><h2>先确认：查到的是谁</h2><small>检索于 {time(discovery.generated_at)}</small></div>
        {discovery.mode==='cached' && <p className="consumer-message">历史缓存：本次查询失败，以下是此前取得的资料。</p>}
        {discovery.mode==='unavailable' && <p role="alert">公开查询暂不可用，请查看下方调查记录后重试。</p>}
        <p>候选是网页或接口提及的主体。请选择要研究的公司；总部、加盟商和具体门店仍需区分。</p>
        {!discovery.candidates.length && <p>本次没有找到可确认的经营主体。请补充城市、门店位置或完整公司名；下方仍可查看已取得的关键词资料。</p>}
        <div className="consumer-candidates">{discovery.candidates.map(c => <article key={c.id} className={selected===c.id?'is-selected':''}>
          <label><input type="radio" name="candidate" checked={selected===c.id} onChange={() => {invalidate();setSelected(c.id);}}/><strong>{c.name}</strong></label><p>{c.basis}</p>{sourceButton(c.source_ids,'匹配依据')}
        </article>)}</div>
        {discovery.sources.length>0 && sourceButton(discovery.sources.map(s=>s.id),'查看关键词资料')}
      </section>}
      {selected && <form className="consumer-panel" onSubmit={e => {e.preventDefault();void analyse();}}>
        <h2>这次准备购买什么</h2><div className="consumer-conditions">
          <label>消费意图<select value={conditions.intent} onChange={e => changeCondition('intent',e.target.value as Conditions['intent'])}><option value="initial_purchase">首次办卡／购买课包</option><option value="top_up">追加充值／加购服务</option><option value="renewal">续费</option><option value="explore">先了解一下</option></select></label>
          <label>服务类型<select value={conditions.service_category} onChange={e=>changeCondition('service_category',e.target.value as Conditions['service_category'])}><option value="fitness">健身服务</option><option value="education">培训（通用公开资料）</option><option value="beauty">美容（通用公开资料）</option><option value="eldercare">养老（通用公开资料）</option><option value="other">其他服务</option></select></label>
          <label>准备预付金额（元，选填）<input type="number" min="0" max="100000000" step="0.01" value={conditions.amount_yuan??''} onChange={e=>changeCondition('amount_yuan',e.target.value===''?null:Number(e.target.value))}/></label>
          <label>预计服务时长（月，选填）<input type="number" min="1" max="120" step="1" value={conditions.service_duration_months??''} onChange={e=>changeCondition('service_duration_months',e.target.value===''?null:Number(e.target.value))}/></label>
        </div><p>不填金额和时长也能查询。金额只用于说明本次消费投入，不改变企业判断。</p>
        <button className="consumer-primary" disabled={pending==='analyse'}>{pending==='analyse'?'正在读取资料…':report?'重新分析':profile?.primary_action || '查看企业变化'}</button>
      </form>}
      {report && <section aria-label="企业变化与消费判断卡" className="consumer-report">
        <div className="consumer-panel"><span className="eyebrow">{modeLabel(report.mode)}</span><h2>{report.identity.name}</h2><p>{report.identity.relationship_status}</p><p>{report.summary}</p>
          {conditions.amount_yuan!==null && <p>本次拟预付：{conditions.amount_yuan.toLocaleString('zh-CN')} 元</p>}
          <small>资料取得截至 {time(report.evidence_as_of)} · 各来源公开日期见详情</small><p className="consumer-message">{report.agent_status}</p></div>
        <div className="consumer-indicators">{report.indicators.map(i=><article className="consumer-panel" key={i.id}>
          <h3>{i.label}</h3><strong className="consumer-indicator-value">{i.value}</strong><p>{i.explanation}</p>
          {i.agent_findings.map((f,j)=><div className="consumer-finding" key={j}><b>智能体证据解释 · 待核实</b><p>{f.explanation}</p>{f.citations.map((c,k)=><blockquote key={k}>“{c.quote}”{sourceButton([c.source_id],'出处')}</blockquote>)}<p>可核实：{f.question}</p></div>)}
          <small>还缺：{i.missing.join('；')}</small><div>{sourceButton(i.source_ids)}</div>
        </article>)}</div>
        <section className="consumer-panel"><h2>值得继续核对的变化线索</h2>{!report.changes.length && <p>当前已覆盖资料中，暂无足以展示的变化记录。</p>}{report.changes.map(c=><article className="consumer-change" key={c.id}><h3>{c.title}</h3><p>{c.fact_text}</p><small>发生日期：{c.event_date||'未核实'} · {c.stage}</small><p>{c.consumer_relevance}</p>{c.interpretations.map((x,j)=><p key={j}>可能解释：{x.text}</p>)}{sourceButton(c.source_ids)}</article>)}</section>
        <section className="consumer-panel"><h2>下一步，向门店问这几件事</h2><ol>{report.questions.map(q=><li key={q}>{q}</li>)}</ol><h3>回应与反向依据</h3><p>{report.counter_search_status}</p>{sourceButton(report.counter_source_ids)}<h3>仍然未知</h3><ul>{report.unknowns.map(u=><li key={u}>{u}</li>)}</ul></section>
        <section className="consumer-panel"><h2>品牌与门店补充资料</h2><p>这些材料只提及品牌或门店，尚未证明与当前研究公司有关，不计入该公司的判断指标。</p>{sourceButton(report.sources.filter(s=>s.scope==='brand_context').map(s=>s.id),'查看关联待核实的线索')}</section>
        <section className="consumer-panel"><h2>数据库参考与独立调查</h2><p>数据库提供复核主题，智能体根据本次真实资料独立补查和解释。</p><p>已训练主题样本：{report.criteria.sample_count} 条 · 具名人工复核：{report.criteria.human_reviewed_count??0} 条 · 智能体补查：{report.agent_rounds} 轮</p><p>{report.criteria.limitation}</p><p>{report.criteria.evaluation}</p>{report.criteria.matches.map(m=><p key={m.category}>匹配复核主题：{m.category}。{m.review_focus}（训练样本不作为当前企业的证据）</p>)}{!report.criteria.matches.length&&<p>未匹配到适用主题，独立公开检索仍照常执行。</p>}</section>
      </section>}
      {!!trace.length && <details className="consumer-panel"><summary>查看调查过程与接口状态（{trace.length} 步）</summary><p>显示实际工具动作及结果摘要，便于核对资料取得过程。</p><ol className="consumer-trace">{trace.map((t,i)=><li key={i}><strong>{t.action}</strong> <span>{({completed:'已执行',failed:'失败',not_configured:'未配置',needs_confirmation:'待确认',user_selected:'用户选择',cached:'历史缓存'} as Record<string,string>)[t.status]||t.status}</span><p>{t.detail}</p></li>)}</ol></details>}
    </main>
    {detail && <Drawer viewKey={detail.map(s=>s.id).join(',')} onClose={()=>setDetail(null)}><h2>本次调查来源</h2>{detail.map(s=><article className="consumer-source" key={s.id}><h3>{s.title}</h3><p>{s.scope==='brand_context'?'品牌相关 · 主体关联待核实 · ':''}{s.publisher} · {evidenceLabel(s)}{s.cached?' · 历史缓存':''}</p><blockquote>{s.excerpt}</blockquote><p>公开日期：{s.published_at||'未知'} · {s.date_semantics}</p><p>取得时间：{time(s.fetched_at)}</p><p>{s.page_status}</p><a href={s.url} target="_blank" rel="noreferrer">{s.channel==='registry'?'查看接口说明':'打开原始链接'} ↗</a></article>)}</Drawer>}
  </div>;
}
