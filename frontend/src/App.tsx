import {useEffect,useRef,useState} from 'react';
import type {FormEvent,PointerEvent as ReactPointerEvent} from 'react';
import {api} from './api/client';
import type {InvestigationInput,InvestigationResult,WebLead} from './api/types';
import TradeDemo from './TradeDemo';
import './investigation.css';

const intents: {id:InvestigationInput['intent'];label:string;description:string}[] = [
  {id:'initial_purchase',label:'首次办卡 / 买课',description:'准备开始长期服务'},
  {id:'add_value',label:'追加充值',description:'已经消费，考虑再投入'},
  {id:'renewal',label:'续费',description:'继续信任同一家店'},
  {id:'look_around',label:'先了解一下',description:'暂时不填消费金额'},
];
const timeLabel=(value:string|null|undefined)=>value?new Date(value).toLocaleString('zh-CN',{hour12:false}):'未标注';

function InvestigationPage(){
  const [query,setQuery]=useState('');
  const [city,setCity]=useState('');
  const [intent,setIntent]=useState<InvestigationInput['intent']>('initial_purchase');
  const [amount,setAmount]=useState('');
  const [months,setMonths]=useState('');
  const [report,setReport]=useState<InvestigationResult|null>(null);
  const [phase,setPhase]=useState<'idle'|'searching'|'done'|'error'>('idle');
  const [error,setError]=useState('');
  const [seconds,setSeconds]=useState(0);
  const [trade,setTrade]=useState(false);
  const [lens,setLens]=useState({x:60,y:57});
  const controller=useRef<AbortController|null>(null);
  const resultRef=useRef<HTMLElement|null>(null);

  useEffect(()=>{
    if(phase!=='searching')return;
    const started=Date.now();
    const timer=window.setInterval(()=>setSeconds(Math.floor((Date.now()-started)/1000)),250);
    return()=>window.clearInterval(timer);
  },[phase]);
  useEffect(()=>()=>controller.current?.abort(),[]);

  function moveLens(event:ReactPointerEvent<HTMLDivElement>){
    if(event.pointerType==='touch')return;
    const bounds=event.currentTarget.getBoundingClientRect();
    setLens({x:Math.max(25,Math.min(78,(event.clientX-bounds.left)/bounds.width*100)),y:Math.max(25,Math.min(76,(event.clientY-bounds.top)/bounds.height*100))});
  }

  async function submit(event:FormEvent){
    event.preventDefault();
    const keyword=query.trim();
    if(keyword.length<2){setError('请输入至少 2 个字的门店、品牌或企业关键词。');setPhase('error');return}
    controller.current?.abort();
    const next=new AbortController();controller.current=next;
    setReport(null);setError('');setSeconds(0);setPhase('searching');
    const input:InvestigationInput={query:keyword,city:city.trim(),intent,amount_yuan:amount?Number(amount):null,service_duration_months:months?Number(months):null};
    try{
      const data=await api.investigate(input,next.signal);
      if(next.signal.aborted)return;
      setReport(data);setPhase('done');
      window.setTimeout(()=>resultRef.current?.scrollIntoView({behavior:'smooth',block:'start'}),50);
    }catch(exc){
      if(next.signal.aborted)return;
      setError(exc instanceof Error?exc.message:'查询未完成，请重试。');setPhase('error');
    }
  }

  function searchAgain(name:string){setQuery(name);setReport(null);setPhase('idle');window.scrollTo({top:0,behavior:'smooth'})}

  if(trade)return <><button className="xr-back" onClick={()=>setTrade(false)}>← 返回企业变化查询</button><TradeDemo/></>;

  return <div className="xr-site">
    <header className="xr-nav">
      <a className="xr-brand" href="#top" aria-label="见微首页"><strong>见微</strong><small>See The Change</small></a>
      <nav aria-label="主导航"><a href="#top" aria-current="page">Intro</a><a href="#investigate">The search</a><a href="#how">Our method</a></nav>
      <a className="xr-nav-action" href="#investigate">开始查证 <sup>↗</sup></a>
    </header>

    <main id="top">
      <section className="xr-hero" aria-labelledby="hero-title">
        <div className="xr-hero-intro">从细微处，看见变化</div>
        <div className="xr-editorial-stage">
          <h1 id="hero-title" className="xr-hero-title"><span>SEE THE</span><span>CHANGE</span></h1>
          <span className="xr-scribble xr-scribble-one">01 / 招牌</span>
          <span className="xr-scribble xr-scribble-two">谁在经营？</span>
          <span className="xr-scribble xr-scribble-three">02 / 线索</span>
          <span className="xr-scribble xr-scribble-four">发生了什么？</span>
          <span className="xr-scribble xr-scribble-five">03 / 核对</span>
          <img className="xr-girl" src="/images/girl-investigator.png" alt="拿着放大镜观察线索的小女孩"/>
          <div className="xr-archive" onPointerMove={moveLens} style={{'--lens-x':`${lens.x}%`,'--lens-y':`${lens.y}%`} as React.CSSProperties} aria-label="鼠标移动放大镜，可透视档案盒中的线索">
            <img className="xr-archive-image" src="/images/archive-box-user.png" alt="牛皮纸档案盒"/>
            <div className="xr-magnifier" aria-hidden="true"><div className="xr-magnifier-scan"><span/><span/><span/><span/></div><img className="xr-magnifier-image" src="/images/magnifier-upright-realistic.png" alt=""/></div>
          </div>
        </div>
        <div className="xr-hero-byline"><em>见微</em> · 一次从名字开始的查证</div>
        <a className="xr-mouse-cue" href="#investigate" aria-label="向下滚动，开始查证"><svg viewBox="0 0 32 50" fill="none" aria-hidden="true"><rect x="5" y="2" width="22" height="36" rx="11" stroke="currentColor" strokeWidth="1.3"/><path d="M16 8v8M12 45l4 4 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg></a>
      </section>

      <section className="xr-manifesto" aria-label="见微的出发点"><div className="xr-manifesto-meta"><span>见微 · THE POINT OF VIEW</span><span>01 / 03</span></div><p>你看到的是一家店。<br/>值得看清的，是<span>招牌背后的经营主体。</span></p><p className="xr-manifesto-second">办卡、买课、续费之前，<br/>先把公开线索<span>放回时间里。</span></p><img src="/images/girl-investigator.png" alt="" aria-hidden="true"/><div className="xr-manifesto-foot">向下，开始追查 <span>↓</span></div></section>

      <section className="xr-investigate" id="investigate">
        <div className="xr-investigate-heading"><span className="xr-section-label">X-RAY / 01</span><h2>从一个名字，<br/>开始追查。</h2><p>输入真实门店、品牌或企业名称。我们从公开线索追查经营主体与近期变化，把能确认的事实、尚未证实的关联和下一步问题分开呈现。</p><div className="xr-hero-notes"><span><b>01</b> 查找经营主体</span><span><b>02</b> 检索公开线索</span><span><b>03</b> 核对证据边界</span></div></div>
          <form className="xr-search-card" onSubmit={submit}>
            <div className="xr-card-head"><span>START AN INVESTIGATION</span><span className="xr-live-pill"><i/> 本次实时查询</span></div>
            <h2>你想了解哪家店？</h2>
            <p>随机输入真实关键词。系统不会用预置案例替代查询失败。</p>
            <label className="xr-field"><span>门店 / 品牌 / 公司名称 <b>*</b></span><div className="xr-input-wrap"><span aria-hidden="true">⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="例如：某健身房、品牌或企业全称" required minLength={2} maxLength={100}/></div></label>
            <label className="xr-field"><span>城市或分店位置 <small>可选 · 帮助区分同名门店</small></span><input value={city} onChange={e=>setCity(e.target.value)} placeholder="例如：杭州 · 滨江" maxLength={40}/></label>
            <fieldset className="xr-intents"><legend>这次准备做什么？</legend><div>{intents.map(item=><button type="button" key={item.id} className={intent===item.id?'active':''} onClick={()=>setIntent(item.id)} title={item.description}>{item.label}</button>)}</div></fieldset>
            <div className="xr-optional-grid"><label className="xr-field"><span>预计预付金额 <small>元 · 可选</small></span><input type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="尚未确定可留空"/></label><label className="xr-field"><span>服务时长 <small>月 · 可选</small></span><input type="number" min="1" max="240" value={months} onChange={e=>setMonths(e.target.value)} placeholder="例如：12"/></label></div>
            <button className="xr-submit" type="submit" disabled={phase==='searching'}>{phase==='searching'?`正在查询 · ${seconds}s`:'开始查证这家店'}<span aria-hidden="true">↗</span></button>
            <div className="xr-search-foot"><span>无需合同、付款截图或个人财务信息</span><span>搜索线索 ≠ 已核实事实</span></div>
          </form>
      </section>

      {(phase==='searching'||phase==='error'||report)&&<section className="xr-results" ref={resultRef} aria-live="polite">
        {phase==='searching'&&<div className="xr-working"><span className="xr-pulse"/><div><span className="xr-section-label">LIVE QUERY / {seconds}s</span><h2>正在向公开搜索源发起本次查询</h2><p>返回内容会保留实际来源和查询时间；若某来源不可访问，会显示缺口。</p></div></div>}
        {phase==='error'&&<div className="xr-error"><span>查询未完成</span><h2>{error}</h2><p>请检查输入或网络连接后重试。页面没有自动切换到预置结果。</p><button type="button" onClick={()=>setPhase('idle')}>返回修改关键词 ↗</button></div>}
        {report&&phase==='done'&&<InvestigationReport report={report} onSearchAgain={searchAgain}/>}
      </section>}

      <section className="xr-method" id="how"><div className="xr-section-heading"><span className="xr-section-label">HOW X-RAY WORKS / 01—03</span><h2>让每一步判断，<br/><em>都有迹可循。</em></h2><p>门店招牌、公司登记、新闻和消费反馈属于不同类型的线索。先核对是不是同一个经营主体，再解释变化。</p></div><div className="xr-method-grid"><article><span>01 / IDENTITY</span><div className="xr-method-symbol">◎</div><h3>从店名找到主体</h3><p>同名、异地和加盟关系分开处理。身份尚未确认时，报告会停在候选线索。</p></article><article><span>02 / EVIDENCE</span><div className="xr-method-symbol">⌁</div><h3>把变化放回时间里</h3><p>每条资料标明来源与时间；搜索摘要只作线索，不能直接变成已核实事件。</p></article><article><span>03 / JUDGEMENT</span><div className="xr-method-symbol">✳</div><h3>同时寻找另一种解释</h3><p>完整分析将结合历史模型与调查智能体；未接入的能力会明确显示，不冒充结果。</p></article></div></section>
      <section className="xr-principles" id="boundaries"><div><span className="xr-section-label">DESIGNED FOR REAL DECISIONS</span><h2>重要的不是一句“安全”或“危险”。</h2><p>你需要知道实际经营者是谁、近期发生了什么、有哪些相反证据，以及办卡或续费前最值得问的问题。</p></div><ul><li><b>公开事实</b><span>可追溯到原始来源和披露时间</span></li><li><b>调查解释</b><span>说明依据与不确定性，不代替事实</span></li><li><b>资料缺口</b><span>没有查到，不等于没有风险</span></li></ul></section>
    </main>
    <footer className="xr-footer"><div className="xr-brand"><strong>见微</strong><small>See The Change</small></div><p>为长期消费前的查证提供依据。当前网页检索结果仅是线索，不能代替经营主体核验或司法认定。</p><button type="button" onClick={()=>setTrade(true)}>原交易演示 ↗</button><span>© 2026 X-Ray</span></footer>
  </div>
}

function InvestigationReport({report,onSearchAgain}:{report:InvestigationResult;onSearchAgain:(name:string)=>void}){
  const [activeLead,setActiveLead]=useState<WebLead|null>(null);
  useEffect(()=>setActiveLead(null),[report]);
  return <div className="xr-report">
    <div className="xr-report-top"><div><span className="xr-section-label">INVESTIGATION / 本次查询</span><h2>“{report.query}”的公开线索</h2><p>{report.city&&`${report.city} · `}查询于 {timeLabel(report.queried_at)} · {report.leads.length} 条去重网页线索</p></div><div className="xr-report-status"><span className="xr-status-dot"/>{report.status==='source_unavailable'?'搜索源不可访问':report.status==='no_results'?'本次未找到线索':'主体仍待确认'}</div></div>
    <div className="xr-report-grid">
      <div className="xr-report-main">
        <section className="xr-panel xr-identity"><div className="xr-panel-caption"><span>01 / 身份核对</span><span>待确认</span></div><h3>查到的名称，不一定就是这家店的经营主体。</h3><p>请结合城市、门店地址和营业执照确认；网页标题中的公司名仅作为下一步检索候选。</p>{report.candidates.length>0?<div className="xr-candidates">{report.candidates.map(c=><button type="button" key={c.name} onClick={()=>onSearchAgain(c.name)}><span>{c.name}</span><small>作为新关键词继续查 ↗</small></button>)}</div>:<div className="xr-empty-line">本次搜索尚未取得可供核对的公司全称。</div>}</section>
        <section className="xr-panel xr-leads"><div className="xr-panel-caption"><span>02 / 本次取得的来源</span><span>{report.leads.length} 条线索</span></div><h3>先看原文，再判断是否相关。</h3>{report.leads.length>0?<div className="xr-lead-list">{report.leads.map((lead,i)=><article key={lead.id}><div className="xr-lead-index">{String(i+1).padStart(2,'0')}</div><div><div className="xr-lead-meta"><span>搜索线索 · 未独立核验</span><span>{lead.published_at?timeLabel(lead.published_at):'发布日期未标注'}</span></div><h4>{lead.title}</h4><p>{lead.snippet||'该搜索结果未提供摘要，请打开原文核对。'}</p><div className="xr-lead-actions"><span>{lead.provider}</span><button type="button" onClick={()=>setActiveLead(lead)}>查看线索详情 ↗</button></div></div></article>)}</div>:<div className="xr-empty-line">{report.status==='source_unavailable'?'公开搜索源本次不可访问；没有取得可展示的结果。':'本次查询未返回可用网页线索。可补充城市或企业全称重试。'}</div>}</section>
      </div>
      <aside className="xr-report-side"><section className="xr-panel xr-judgement"><div className="xr-panel-caption"><span>03 / 双重判断机制</span><span>能力状态</span></div><h3>分析建立在真实取得的资料上。</h3><div className="xr-capability"><div className="xr-capability-icon">M</div><div><b>历史训练模型</b><p>{report.training_model.detail}</p><small>状态：尚不可用 · 不输出训练判断</small></div></div><div className="xr-capability"><div className="xr-capability-icon">A</div><div><b>联网调查智能体</b><p>{report.agent.detail}</p><small>状态：尚未接入 · 不声称已寻找反证</small></div></div><div className="xr-warning-note">当前结果仅是实时搜索线索，尚不能得出“值得信任”或“存在风险”的结论。</div></section><section className="xr-panel"><div className="xr-panel-caption"><span>04 / 实际调查轨迹</span><span>可审计</span></div><ol className="xr-trace">{report.trace.map((item,i)=><li key={`${item.step}-${i}`}><b>{item.step}</b><p>{item.detail}</p></li>)}</ol></section><section className="xr-panel"><div className="xr-panel-caption"><span>05 / 来源覆盖</span><span>本次状态</span></div><div className="xr-coverage">{report.coverage.map(item=><div key={item.name}><span>{item.name}<small>{item.detail}</small></span><b className={item.status==='queried'?'yes':''}>{item.status==='queried'?'已查询':item.status==='not_connected'?'未接入':'不可访问'}</b></div>)}</div>{report.failures.length>0&&<p className="xr-failures">{report.failures.length} 次请求失败，已保留其他成功来源。</p>}</section><section className="xr-panel xr-questions"><div className="xr-panel-caption"><span>下一步可核实</span><span>最多三项</span></div><ol><li>门店公示的营业执照上，完整经营主体名称是什么？</li><li>搜索结果涉及的城市、地址和分店是否与眼前这家一致？</li><li>相关消息有无官方原文、后续说明或已处理状态？</li></ol></section></aside>
    </div>
    {activeLead&&<div className="xr-modal-backdrop" onClick={()=>setActiveLead(null)}><aside className="xr-modal" role="dialog" aria-modal="true" aria-label="搜索线索详情" onClick={e=>e.stopPropagation()}><button type="button" className="xr-modal-close" onClick={()=>setActiveLead(null)} aria-label="关闭线索详情">×</button><span className="xr-section-label">SOURCE / 搜索线索</span><h2>{activeLead.title}</h2><p>来源：{activeLead.provider} · {activeLead.published_at?`网页标注 ${timeLabel(activeLead.published_at)}`:'发布日期未标注'}</p><div className="xr-modal-quote">{activeLead.snippet||'搜索源未提供摘要。'}</div><p className="xr-modal-caveat">这是搜索结果摘要，尚未核验原文、涉及主体和事件状态。请在原网站继续核对。</p><a href={activeLead.url} target="_blank" rel="noopener noreferrer">打开原始网页 ↗</a></aside></div>}
  </div>
}

export default InvestigationPage;
