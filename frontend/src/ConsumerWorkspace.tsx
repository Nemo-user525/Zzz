import { useEffect, useRef, useState } from 'react';
import { api } from './api/client';
import { consumerApi, type RiskAnalysis, type Capabilities, type Conditions, type Discovery, type Evidence } from './api/consumer';
import type { UseCase } from './api/types';
import { ConsumerReportPages, type ReportPage } from './ConsumerReportPages';
import { QccSession } from './QccSession';
import { displayText } from './consumerPresentation';
import './consumer.css';
import './consumer-pages.css';

const time = (value:string) => new Date(value).toLocaleString('zh-CN');

export function ConsumerWorkspace() {
  const [profile,setProfile] = useState<UseCase|null>(null);
  const [cap,setCap] = useState<Capabilities|null>(null);
  const [query,setQuery] = useState('');
  const [location,setLocation] = useState('');
  const [discovery,setDiscovery] = useState<Discovery|null>(null);
  const [selected,setSelected] = useState('');
  const [report,setReport] = useState<RiskAnalysis|null>(null);
  const [progress,setProgress] = useState('');
  const riskTop = useRef<HTMLDivElement|null>(null);
  const [conditions,setConditions] = useState<Conditions>({intent:'initial_purchase',service_category:'fitness',amount_yuan:null,service_duration_months:null});
  const [pending,setPending] = useState<'search'|'analyse'|null>(null);
  const [error,setError] = useState('');
  const [detail,setDetail] = useState<Evidence[]|null>(null);
  const [reportPage,setReportPage] = useState<ReportPage>('overview');
  const seq = useRef(0);
  const controller = useRef<AbortController|null>(null);
  useEffect(()=>{if(report) riskTop.current?.scrollIntoView?.({behavior:'smooth',block:'start'});},[report]);
  useEffect(() => {
    let active=true;
    const boot = new AbortController();
    api.useCases().then(x => active && setProfile(x.use_cases.find(p => p.presentation_mode === 'consumer_changes') || null)).catch(() => {});
    consumerApi.capabilities(boot.signal).then(x => active && setCap(x)).catch(() => {});
    return () => {active=false; boot.abort(); controller.current?.abort(); seq.current++;};
  },[]);
  function invalidate(clearSearch=false) {
    seq.current++; controller.current?.abort(); setPending(null); setProgress(''); setReport(null); setDetail(null); setReportPage('overview'); setError('');
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
      const value=await consumerApi.analyse(discovery.investigation_id,selected,conditions,controller.current.signal,message=>{if(seq.current===current)setProgress(message);});
      if (seq.current===current) {setReport(value);setReportPage('overview');}
    } catch(e) {if(seq.current===current) setError(e instanceof Error ? e.message : '调查失败，请重试');}
    finally {if(seq.current===current) setPending(null);}
  }
  function sourceButton(ids:string[],label='查看依据') {
    const allSources=[...new Map([...(discovery?.sources||[]),...(report?.sources||[])].map(s=>[s.id,s])).values()];
    const rows=allSources.filter(s => ids.includes(s.id));
    return <button type="button" className="ghost" disabled={!rows.length} onClick={() => setDetail(rows)}>{label}（{rows.length}）</button>;
  }
  function go(page:ReportPage) {setReportPage(page);riskTop.current?.scrollIntoView?.({behavior:'smooth',block:'start'});}
  function changeCondition<K extends keyof Conditions>(key:K,value:Conditions[K]) {invalidate(); setConditions(c => ({...c,[key]:value}));}
  return <div className="app-shell consumer-shell">
    <header className="topbar"><div className="brand"><span className="brand-icon">✦</span><div><strong>X-RAY</strong><small>企业变化解释器</small></div></div>
      <nav aria-label="工作区"><a href="?view=history">企业检索与历史回放</a><a href="?view=trade">原交易演示</a></nav></header>
    <main className="consumer-main">
      {detail && !report ? <section className="consumer-panel consumer-page"><h2>证据详情</h2><p>逐条看资料的来源和时间，再判断是不是你要查的门店。</p>
        {detail.map(s=><article className="consumer-source" key={s.id}><h3>{s.title}</h3><p>{s.publisher}</p><blockquote>{s.excerpt}</blockquote><p>公开日期：{s.published_at||'没有标明'} · 取得时间：{time(s.fetched_at)}</p><p>{s.page_status}</p><a href={s.url} target="_blank" rel="noreferrer">打开来源 ↗</a></article>)}
        <button type="button" className="consumer-page-back" onClick={()=>setDetail(null)}>← 返回上一页</button>
      </section> : report ? <div ref={riskTop}><ConsumerReportPages report={report} page={reportPage} onPage={go}
        onNewSearch={()=>{setReport(null);setReportPage('overview');setDetail(null);window.scrollTo({top:0,behavior:'smooth'});}}
        sourceButton={sourceButton} detail={detail} onCloseDetail={()=>setDetail(null)}/></div> : <>
      <section className="consumer-hero"><div className="eyebrow">办卡 · 买课 · 充值 · 续费之前</div>
        <h1>{profile?.headline || '这家店，现在值得长期信任吗？'}</h1>
        <p>{profile?.subtitle || '查清背后的经营主体，看懂近期变化，再决定是否办卡、买课、充值或续费。'}</p>
        <div className="consumer-capabilities"><span>真实联网 · 多渠道调查</span>{cap?.agent_enabled&&<span>{cap.model_name || '推理模型'} · 已配置</span>}{cap?.qcc_configured&&<span>企查查授权接口 · 已配置</span>}<span>新闻 · 公告 · 社区反馈</span></div>
      </section>
      <QccSession active={pending!==null}/>
      <form className="consumer-panel consumer-search" onSubmit={e => {e.preventDefault(); void search();}}>
        <label>门店、品牌或公司名称<input required minLength={2} maxLength={80} value={query} placeholder="输入门店或公司名称，可补充城市、分店位置" onChange={e => {invalidate(true);setQuery(e.target.value);}}/></label>
        <label>城市／门店位置（选填）<input maxLength={60} value={location} placeholder="例如：杭州 西湖区" onChange={e => {invalidate(true);setLocation(e.target.value);}}/></label>
        <button className="consumer-primary" disabled={pending==='search' || query.trim().length<2}>{pending==='search' ? '正在查找经营主体…' : '查找经营主体'}</button>
      </form>
      {error && <p className="consumer-message" role="alert">{error}。未使用样例替代失败结果。</p>}
      {pending && <p role="status" className="consumer-message">{pending==='search' ? '正在查询公开网页和可用企业接口，并识别关键词对应的公司。' : progress || '正在开始广泛调查；模型会分批阅读材料，可能需要数分钟。'}<button className="ghost" onClick={() => invalidate()}>取消</button></p>}
      {discovery && <section className="consumer-panel">
        <div className="consumer-section-head"><h2>先确认：查到的是谁</h2><small>检索于 {time(discovery.generated_at)}</small></div>
        {discovery.mode==='cached' && <p className="consumer-message">历史缓存：本次查询失败，以下是此前取得的资料。</p>}
        {discovery.mode==='unavailable' && <p role="alert">公开查询暂不可用，请查看下方调查记录后重试。</p>}
        <p>候选是网页或接口提及的主体。请选择要研究的公司；总部、加盟商和具体门店仍需区分。</p>
        {!discovery.candidates.length && <p>本次没有找到可确认的经营主体。请补充城市、门店位置或完整公司名；下方仍可查看已取得的关键词资料。</p>}
        <div className="consumer-candidates">{discovery.candidates.map(c => <article key={c.id} className={selected===c.id?'is-selected':''}>
          <label><input type="radio" name="candidate" checked={selected===c.id} onChange={() => {invalidate();setSelected(c.id);}}/><strong>{c.name}</strong></label><p>{displayText(c.basis)}</p>{sourceButton(c.source_ids,'匹配依据')}
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
      </>}
    </main>
  </div>;
}
