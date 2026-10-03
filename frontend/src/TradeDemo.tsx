import {useEffect,useMemo,useState} from 'react';
import ReactECharts from 'echarts-for-react';
import {api} from './api/client';
import type {Company,Comparison,Health,RiskEvent,SimulationInput,SimulationResult,Source,UseCase} from './api/types';

const money=(n:number|null|undefined)=>n==null?'未披露':new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(n/10000)+' 万元';
const numeric=(n:number)=>Number.isFinite(n)?n:0;
const first=(x:string)=>{const parts=x.split('/');return parts[parts.length-1]||x};

function App(){
  const [health,setHealth]=useState<Health|null>(null);
  const [profile,setProfile]=useState<UseCase|null>(null);
  const [profiles,setProfiles]=useState<UseCase[]>([]);
  const [company,setCompany]=useState<Company|null>(null);
  const [events,setEvents]=useState<RiskEvent[]>([]);
  const [inputs,setInputs]=useState<SimulationInput|null>(null);
  const [result,setResult]=useState<SimulationResult|null>(null);
  const [comparison,setComparison]=useState<Comparison|null>(null);
  const [source,setSource]=useState<Source|null>(null);
  const [drawer,setDrawer]=useState<'source'|'math'|'card'|null>(null);
  const [advanced,setAdvanced]=useState(false);
  const [running,setRunning]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{let alive=true;Promise.all([api.health(),api.useCases(),api.demo()]).then(async([h,p,i])=>{
    const [c,e]=await Promise.all([api.company(i.company_id),api.events(i.company_id)]);
    if(!alive)return;setHealth(h);setProfiles(p.use_cases);setProfile(p.use_cases.find(u=>u.id===p.default_use_case_id)||p.use_cases[0]);setInputs(i);setCompany(c);setEvents(e);
  }).catch(e=>setError(e.message));return()=>{alive=false}},[]);

  useEffect(()=>{if(!inputs||!running)return;let alive=true;const t=setTimeout(()=>{
    Promise.all([api.simulate(inputs),api.compare(inputs)]).then(([r,c])=>{if(alive){setResult(r);setComparison(c);setError('')}}).catch(e=>alive&&setError(e.message));
  },120);return()=>{alive=false;clearTimeout(t)}},[inputs,running]);

  function setInput<K extends keyof SimulationInput>(key:K,value:SimulationInput[K]){setInputs(v=>v?{...v,[key]:value}:v)}
  async function showSource(id:string){try{setSource(await api.source(id));setDrawer('source')}catch(e){setError((e as Error).message)}}
  async function reset(){try{const i=await api.demo();setInputs(i);setRunning(false);setResult(null);setComparison(null);setDrawer(null);setAdvanced(false);setError('')}catch(e){setError((e as Error).message)}}
  const current=useMemo(()=>result||null,[result]);
  function cardField(key:string){
    if(!company||!result)return null;
    const fields:Record<string,()=>React.ReactNode>={
      legal_name:()=> <p>{company.legal_name}（{company.ticker}）</p>,
      ticker:()=> <p>证券代码：{company.ticker}</p>,
      coverage:()=> <p>覆盖：{company.coverage}</p>,
      risk_events:()=> <>{events.filter(e=>e.verification_status==='verified').map(e=><p key={e.id}>{e.event_date} · {e.explanation} <button className="inline-link" onClick={()=>showSource(e.source_ids[0])}>来源 ↗</button></p>)}</>,
      financials:()=> <>{company.financials.filter(f=>f.verification_status==='verified').map(f=><p key={f.field}>{f.field} {money(f.value_yuan)}（{f.period}） <button className="inline-link" onClick={()=>showSource(f.source_id)}>来源 ↗</button></p>)}</>,
      source_links:()=> <p>每条事实均可点击来源与页码。</p>,
      unknowns:()=> <>{company.unknowns.map(x=><p key={x}>• {x}</p>)}</>,
      scenario_inputs:()=> <p>订单 {money(inputs?.order_amount_yuan)}；预付款 {Math.round((inputs?.prepayment_rate||0)*100)}%；延付 {inputs?.delay_days} 天。数据为虚构交易情景。</p>,
      assumptions:()=> <>{result.assumptions.map(x=><p key={x}>• {x}</p>)}</>,
      formula_breakdown:()=> <>{result.formula_breakdown.map(x=><p key={x}>• {x}</p>)}</>,
      shortfall_yuan:()=> <p>最低现金 {money(result.minimum_balance_yuan)}；底线缺口 {money(result.shortfall_yuan)}。</p>,
      comparison:()=> <p>{comparison?.explanation||'可考虑协商预付款或分批发货。'}</p>
    };
    return fields[key]?.()||<p>字段 {key} 尚未配置展示规则</p>;
  }
  const chart=useMemo(()=>{
    const curve=current?.cash_curve||[{day:0,balance_yuan:3000000},{day:90,balance_yuan:3000000}];
    const floor=inputs?.safety_floor_yuan||200000;
    return {backgroundColor:'transparent',animationDuration:300,grid:{left:72,right:26,top:30,bottom:46},tooltip:{trigger:'axis',backgroundColor:'#132130',borderColor:'#3c5764',textStyle:{color:'#eef7f7'},formatter:(params:any)=>{const p=params[0];return `第 ${p.axisValue} 天<br/>现金余额 ${money(p.data[1])}`}},xAxis:{type:'value',min:0,max:90,interval:15,axisLabel:{color:'#9eb6c1',formatter:(x:number)=>`第${x}天`},axisLine:{lineStyle:{color:'#304857'}},splitLine:{show:false}},yAxis:{type:'value',axisLabel:{color:'#9eb6c1',formatter:(x:number)=>(x/10000).toFixed(0)+'万'},splitLine:{lineStyle:{color:'#233a49',type:'dashed'}}},series:[{type:'line',name:'现金余额',data:curve.map(p=>[p.day,p.balance_yuan]),smooth:false,showSymbol:false,lineStyle:{color:'#59e2d0',width:4},areaStyle:{color:'rgba(57,206,185,.13)'},markLine:{symbol:'none',silent:true,lineStyle:{color:'#f0b975',type:'dashed',width:2},label:{color:'#f0b975',formatter:'安全底线'},data:[{yAxis:floor}]}},{type:'scatter',data:current?[[current.minimum_day,current.minimum_balance_yuan]]:[],symbolSize:14,itemStyle:{color:'#f48e77'},z:5}]};
  },[current,inputs?.safety_floor_yuan]);

  if(error&&!inputs)return <div className="fatal"><b>演示数据暂未载入</b><p>{error}</p><p>请先启动后端并运行 seed，再刷新页面。</p></div>;
  return <div className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-icon">✦</span><div><strong>X-RAY</strong><small>这一单，扛得住吗？</small></div></div><div className="top-meta"><span className="status-dot"/> 离线可用 · {health?.verified_company_count??'—'} 家企业 · {health?.verified_source_count??'—'} 份官方来源 <span className="divider"/> 资料截至 {health?.as_of||'—'}</div><button className="ghost reset" onClick={reset}>↺ 重置演示</button></header>
    <main>
      <section className="hero"><div className="eyebrow">交易前 · 现金底线核对台 <span>DEMO 01 / 01</span>{profiles.length>1&&<select className="profile-select" aria-label="用户场景" value={profile?.id||''} onChange={e=>setProfile(profiles.find(p=>p.id===e.target.value)||null)}>{profiles.map(p=><option key={p.id} value={p.id}>{p.target_user}</option>)}</select>}</div><h1>{profile?.headline||'客户说：先发货，90 天后付款'}</h1><p>{profile?.subtitle||'在签下一笔订单前，先看清客户，再走一遍未来 90 天。'}</p><div className="hero-bottom"><span><b>目标用户</b> {profile?.target_user||'—'}</span><span><b>决策目标</b> {profile?.decision_goal||'—'}</span></div></section>
      {error&&<div className="error-banner">{error}</div>}
      <div className="workspace">
        <section className="panel evidence-panel"><div className="panel-head"><div><span className="section-index">01 / 公开事实</span><h2>先看客户证据</h2></div><span className="outlined">已核验</span></div>
          <div className="identity"><div className="identity-mark">{company?.short_name?.slice(0,1)||'企'}</div><div><h3>{company?.short_name||'载入中'}</h3><p>{company?.legal_name||''}</p><div className="identity-tags"><span>{company?.listed?'A 股上市':'非上市'} · {company?.ticker||'代码未披露'}</span><span>{company?.industry||''}</span></div></div></div>
          <div className="evidence-divider"/>
          <div className="small-label">风险线索 <span>公开事实</span></div>
          {events.filter(e=>e.verification_status==='verified').length===0&&<div className="unknown-box"><b>暂无已核实风险事件</b><p>当前覆盖资料有限，不能据此认定企业无风险。</p></div>}
          {events.filter(e=>e.verification_status==='verified').map(e=><div className="event-card" key={e.id}><div className="event-top"><span className="date">{e.event_date}</span><span className="chip amber">{e.stage}</span></div><h4>{e.type}</h4><p>{e.explanation}</p><div className="event-entity">涉及主体：{e.affected_entity}</div><button className="source-link" onClick={()=>showSource(e.source_ids[0])}>查看原始公告与引用页 <span>↗</span></button></div>)}
          <div className="small-label finance-label">财务事实 <span>未经审计 · 合并口径</span></div>
          {company?.financials.filter(f=>f.verification_status==='verified').map(f=><button className="fact-row" key={f.field} onClick={()=>showSource(f.source_id)}><span><b>{f.field}</b><small>{first(f.period)} · 来源可查</small></span><strong>{money(f.value_yuan)}</strong><i>↗</i></button>)}
          <div className="unknown-box"><b>未知仍是未知</b><p>{company?.unknowns[0]||'历史付款记录暂无法核实'}；不能据此推算违约概率。</p></div>
        </section>
        <section className="panel simulation-panel"><div className="panel-head"><div><span className="section-index">02 / 情景假设 × 计算结果</span><h2>这一单，现金会怎么走？</h2></div><span className="outlined teal">90 天视窗</span></div>
          <div className="order-strip"><div><small>演示订单</small><strong>{money(inputs?.order_amount_yuan)}</strong></div><div><small>账期</small><strong>发货后 {inputs?.payment_term_days??90} 天</strong></div><div><small>本方期初现金</small><strong>{money(inputs?.opening_cash_yuan)}</strong></div></div>
          <div className="chart-title"><span>本方现金余额走势</span><span>单位：万元 · 订单与本方数据均为虚构</span></div><div className="chart-wrap"><ReactECharts option={chart} style={{height:'100%',width:'100%'}} notMerge/></div>
          <div className="timeline"><span className="t-dot teal-dot">签约<br/>第 0 天</span><span className="t-line"/><span className="t-dot">成本支出<br/>第 {inputs?.cost_day??10} 天</span><span className="t-line"/><span className="t-dot amber-dot">其他净流出<br/>第 {inputs?.other_net_cashflows[0]?.day??75} 天</span><span className="t-line"/><span className="t-dot">回款{current?.outside_view_payment?'在视窗外':''}<br/>第 {current?.final_payment_day??(inputs?inputs.payment_term_days+inputs.delay_days+10:'—')} 天</span></div>
          <div className="result-strip"><div><small>90 天内现金最低点 <span className="label-calc">计算结果</span></small><strong className={current&&current.shortfall_yuan>0?'warning':''}>{current?money(current.minimum_balance_yuan):'点击推演'}</strong><p>{current?`第 ${current.minimum_day} 天`:'数值由后端逐日计算'}</p></div><div><small>安全底线</small><strong>{money(inputs?.safety_floor_yuan)}</strong><p>{current?.first_breach_day!=null?`第 ${current.first_breach_day} 天跌破`:current?'未跌破':'由用户设定'}</p></div><div><small>底线缺口</small><strong className={current&&current.shortfall_yuan>0?'warning':''}>{current?money(current.shortfall_yuan):'—'}</strong><p>{current?.outside_view_payment?`余款第 ${current.final_payment_day} 天才到账`:' '}</p></div></div>
        </section>
        <section className="panel control-panel"><div className="panel-head"><div><span className="section-index">03 / 改交易条件</span><h2>试一种更稳的签法</h2></div></div><div className="scenario-note">所有滑块都是<span>情景假设</span>。风险公告不会自动推断客户延付。</div>
          <button className="primary" onClick={()=>setRunning(true)}>{running?'已启动 · 参数更改实时重算':profile?.primary_action||'推演这笔订单'} <span>→</span></button>
          <div className="control-group"><div className="control-line"><label htmlFor="delay">客户延付</label><strong>+{inputs?.delay_days??0} 天</strong></div><div className="segmented">{[0,30,60].map(v=><button key={v} className={inputs?.delay_days===v?'active':''} onClick={()=>setInput('delay_days',v)}>{v===0?'按期':`延付 ${v} 天`}</button>)}</div></div>
          <div className="control-group slider-group"><div className="control-line"><label htmlFor="advance">预付款比例</label><strong className="teal-text">{Math.round((inputs?.prepayment_rate||0)*100)}%</strong></div><input id="advance" type="range" min="0" max="60" step="5" value={Math.round((inputs?.prepayment_rate||0)*100)} onChange={e=>setInput('prepayment_rate',numeric(Number(e.target.value))/100)}/><div className="range-label"><span>0%</span><span>30%</span><span>60%</span></div><p className="helper">先到账 {money((inputs?.order_amount_yuan||0)*(inputs?.prepayment_rate||0))}；余款与订单总价保持一致。</p></div>
          <div className="control-group"><div className="control-line"><label htmlFor="term">发货后账期</label><strong>{inputs?.payment_term_days} 天</strong></div><input id="term" type="range" min="0" max="180" step="5" value={inputs?.payment_term_days??90} onChange={e=>setInput('payment_term_days',Number(e.target.value))}/></div>
          <button className="text-button" onClick={()=>setAdvanced(v=>!v)}>{advanced?'收起详细参数':'编辑成本、发货、其他现金流'} <span>{advanced?'−':'+'}</span></button>
          {advanced&&inputs&&<div className="advanced-grid"><label>订单额（万元）<input type="number" min="1" value={inputs.order_amount_yuan/10000} onChange={e=>setInput('order_amount_yuan',Number(e.target.value)*10000)}/></label><label>直接成本（万元）<input type="number" min="0" value={(inputs.direct_cost_yuan??inputs.order_amount_yuan*(1-(inputs.gross_margin_rate??0)))/10000} onChange={e=>setInput('direct_cost_yuan',Number(e.target.value)*10000)}/></label><label>期初现金（万元）<input type="number" min="0" value={inputs.opening_cash_yuan/10000} onChange={e=>setInput('opening_cash_yuan',Number(e.target.value)*10000)}/></label><label>安全底线（万元）<input type="number" min="0" value={inputs.safety_floor_yuan/10000} onChange={e=>setInput('safety_floor_yuan',Number(e.target.value)*10000)}/></label><label>成本支付日<input type="number" min="0" value={inputs.cost_day} onChange={e=>setInput('cost_day',Number(e.target.value))}/></label><label>第 1 批发货日<input type="number" min="0" value={inputs.shipments?.[0]?.day??10} onChange={e=>setInput('shipments',(inputs.shipments||[{day:10,fraction:1}]).map((s,i)=>i===0?{...s,day:Number(e.target.value)}:s))}/></label><label>第 2 批发货比例<input type="range" min="0" max="50" step="10" value={inputs.shipments?.length===2?inputs.shipments[1].fraction*100:0} onChange={e=>{const n=Number(e.target.value)/100;const firstDay=inputs.shipments?.[0]?.day??10;setInput('shipments',n?[{day:firstDay,fraction:1-n},{day:45,fraction:n}]:[{day:firstDay,fraction:1}])}}/></label>{inputs.shipments?.length===2&&<label>第 2 批发货日<input type="number" min="0" value={inputs.shipments[1].day} onChange={e=>setInput('shipments',inputs.shipments!.map((s,i)=>i===1?{...s,day:Number(e.target.value)}:s))}/></label>}<div className="cashflows"><b>其他业务现金流（虚构，支出填负数）</b>{inputs.other_net_cashflows.map((flow,index)=><div className="cashflow-row" key={index}><label>第几天<input type="number" min="0" value={flow.day} onChange={e=>setInput('other_net_cashflows',inputs.other_net_cashflows.map((f,i)=>i===index?{...f,day:Number(e.target.value)}:f))}/></label><label>金额（万元）<input type="number" value={flow.amount_yuan/10000} onChange={e=>setInput('other_net_cashflows',inputs.other_net_cashflows.map((f,i)=>i===index?{...f,amount_yuan:Number(e.target.value)*10000}:f))}/></label><button onClick={()=>setInput('other_net_cashflows',inputs.other_net_cashflows.filter((_,i)=>i!==index))}>移除</button></div>)}<button className="add-flow" onClick={()=>setInput('other_net_cashflows',[...inputs.other_net_cashflows,{day:60,amount_yuan:0,label:'用户新增现金流（虚构）'}])}>+ 添加支出或回款</button></div></div>}
          <div className="action-row"><button className="secondary" disabled={!result} onClick={()=>setDrawer('math')}>这怎么算的 <span>↗</span></button><button className="secondary" disabled={!result} onClick={()=>setDrawer('card')}>交易核对卡 <span>↗</span></button></div>
          {comparison&&<div className="comparison"><div className="small-label">同一组假设 · 方案对比</div>{comparison.variants.map(v=><div key={v.name}><span>{v.name}</span><strong>{money(v.result.minimum_balance_yuan)}</strong></div>)}<small>放弃订单将失去预期毛利 {money(comparison.opportunity_cost_yuan)}。</small></div>}
        </section>
      </div><footer><span>事实有出处，假设可改，结果可重算。</span><span>本工具用于交易前核对，不提供违约概率、法律意见或授信结论。</span></footer>
    </main>
    {drawer&&<div className="overlay" onClick={()=>setDrawer(null)}><aside className="drawer" onClick={e=>e.stopPropagation()}><button className="drawer-close" onClick={()=>setDrawer(null)}>×</button>
      {drawer==='source'&&source&&<><span className="section-index">公开事实 / 来源详情</span><h2>{source.title}</h2><p className="drawer-lead">{source.institution} · {source.published_at}</p><div className="info-list"><div><span>公告编号</span><strong>{source.notice_number||'未标注'}</strong></div><div><span>引用页</span><strong>第 {source.page} 页</strong></div><div><span>采集日期</span><strong>{source.fetched_at}</strong></div><div><span>文件 SHA-256</span><code>{source.sha256}</code></div></div><div className="quote">“{source.excerpt}”</div><a className="external" href={source.url} target="_blank" rel="noopener noreferrer">打开官方原始 PDF ↗</a><p className="drawer-foot">页面离线运行时，本地缓存位于 data/source_docs；在线链接需要网络。</p></>}
      {drawer==='math'&&result&&<><span className="section-index">情景假设 / 计算结果</span><h2>现金最低点怎么得出？</h2><p className="drawer-lead">引擎逐日求和：期初现金 + 当日前所有流入 − 当日前所有流出。</p>{result.formula_breakdown.map((v,i)=><div className="formula" key={i}><span>0{i+1}</span>{v}</div>)}<div className="quote">{result.outside_view_payment?`第 ${result.final_payment_day} 天才到账，超出 90 天图表视窗；不等于坏账。`:'回款日位于 90 天视窗内。'}</div><h3>边界</h3>{result.assumptions.map((a,i)=><p key={i} className="assumption">• {a}</p>)}</>}
      {drawer==='card'&&company&&result&&profile&&<><span className="section-index">可追溯输出</span><h2>{profile.output_template.title}</h2><p className="drawer-lead">{profile.target_user} · {profile.decision_goal}</p>{profile.output_template.sections.map(s=><section className="card-section" key={s.id}><h3>{s.title}</h3>{s.fields.map(f=><div key={f}>{cardField(f)}</div>)}</section>)}</>}
    </aside></div>}
  </div>
}
export default App;
