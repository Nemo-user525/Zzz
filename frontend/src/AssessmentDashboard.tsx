import {useEffect,useState} from 'react';
import {loadPublicFinancials,securityCode,type PublicFinancials} from './api/publicFinancials';
import {dimensions,evaluate,levelText,summary,type Subject,type Draft,type Dimension,type Role,type Check} from './assessment';
import './assessment.css';

const colors={reference:'#00846a',attention:'#966321',observed:'#46706c',unknown:'#7a7c74'};
const roles:{id:Role;label:string}[]=[{id:'enterprise',label:'企业 / 合作方'},{id:'investor',label:'投资者'},{id:'beginner',label:'小白 / 易懂版'},{id:'senior',label:'老年人 / 大字版'}];
type InputField={id:string;label:string;unit?:string;max?:number;options?:[string,string][]};
const yesNo:[string,string][]=[['yes','存在'],['no','资料显示不存在']];
const verified:[string,string][]=[['flag','发现待关注事项'],['clear','已核验期间内未见事项']];
const fields:Record<Dimension,InputField[]>={
  cash:[{id:'usable_cash',label:'可自由使用现金',unit:'万元'},{id:'rent',label:'月均房租',unit:'万元'},{id:'wages',label:'月均工资与社保',unit:'万元'},{id:'purchases',label:'月均刚性货款',unit:'万元'},{id:'loans',label:'月均还本付息',unit:'万元'},{id:'other',label:'其他月均刚性支出',unit:'万元'},{id:'debt_ratio',label:'补充资产负债率（可覆盖公开值）',unit:'%',max:10000}],
  credit:[{id:'penalty',label:'处罚与经营异常核验',options:verified},{id:'judicial',label:'司法与失信核验',options:verified},{id:'tax',label:'纳税信用等级',options:['A','B','M','C','D'].map(g=>[g,g+' 级'])},{id:'pledge',label:'抵押与股权出质核验',options:verified},{id:'heavy_pledge',label:'股东是否大量质押',options:yesNo},{id:'share_changes',label:'股权是否频繁更换',options:yesNo}],
  dependency:[{id:'top2',label:'前两大客户收入占比',unit:'%',max:100},{id:'top2_limit',label:'自定集中度参考上限（可留空）',unit:'%',max:100},{id:'customer_person',label:'客户资源是否依赖单一员工',options:yesNo},{id:'technology_person',label:'核心技术是否依赖单一员工',options:yesNo}],
  reputation:[{id:'employee_approval',label:'员工认可度',unit:'%',max:100},{id:'wage_arrears',label:'是否拖欠工资',options:yesNo},{id:'social_arrears',label:'是否拖欠社保',options:yesNo},{id:'turnover',label:'员工离职率',unit:'%',max:100},{id:'supplier_days',label:'供应商货款最长逾期',unit:'天',max:36500},{id:'complaints',label:'售后投诉率',unit:'%',max:100},{id:'consumer_approval',label:'产品认可度',unit:'%',max:100}],
};
const conciseMoney=(v:number)=>Math.abs(v)>=1e8?(v/1e8).toFixed(2)+' 亿元':(v/1e4).toFixed(2)+' 万元';

function EvidenceGraph({checks,selected,onSelect}:{checks:Check[];selected:Dimension;onSelect:(v:Dimension)=>void}) {
  const points=[[108,70],[352,70],[352,257],[108,257]];
  return <svg viewBox="0 0 460 330" role="img" aria-label="四维核对关系图：节点只代表核对项目，不代表股权关系或风险评分">
    <defs><radialGradient id="evidence-glow"><stop stopColor="#00846a" stopOpacity=".07"/><stop offset="1" stopColor="#e9e9e9" stopOpacity="0"/></radialGradient></defs>
    <circle cx="230" cy="165" r="144" fill="url(#evidence-glow)"/>
    {[55,105,145].map(r=><circle key={r} cx="230" cy="165" r={r} fill="none" stroke="#c4c7c0" strokeDasharray="3 8"/>)}
    {dimensions.map((d,i)=>{
      const items=checks.filter(c=>c.dimension===d.id),count=items.filter(c=>c.level!=='unknown').length;
      const level=items.some(c=>c.level==='attention')?'attention':count===0?'unknown':count<items.length?'observed':'reference';
      const [x,y]=points[i];
      return <g key={d.id} role="button" tabIndex={0} aria-label={'查看'+d.title} onClick={()=>onSelect(d.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(d.id);}}} className="dimension-node">
        <line x1="230" y1="165" x2={x} y2={y} stroke={colors[level]} strokeWidth={selected===d.id?2:1} strokeDasharray={count?undefined:'4 5'}/>
        <circle cx={x} cy={y} r={selected===d.id?40:35} fill="#f3f3ef" stroke={colors[level]} strokeWidth="2"/>
        <text x={x} y={y+3} textAnchor="middle" fill={colors[level]} fontSize="21">{count}<tspan fontSize="11">/{items.length}</tspan></text>
        <text x={x} y={y+54} textAnchor="middle" fill="#262b27" fontSize="12">{['现金与负债','信用与治理','客户与人员','员工与口碑'][i]}</text>
        {items.map((item,j)=>{const angle=Math.PI*2*j/items.length;return <circle key={item.id} cx={x+48*Math.cos(angle)} cy={y+48*Math.sin(angle)} r="3" fill={colors[item.level]}><title>{item.label}：{item.value} · {levelText[item.level]}</title></circle>;})}
      </g>;
    })}
    <circle cx="230" cy="165" r="40" fill="#e0e9e1" stroke="#00846a"/>
    <text x="230" y="160" textAnchor="middle" fill="#174c40" fontSize="15">企业证据</text><text x="230" y="181" textAnchor="middle" fill="#57655b" fontSize="10">可追溯 · 可补充</text>
  </svg>;
}

function CashTrend({data}:{data:PublicFinancials|null}) {
  const rows=(data?.groups.find(g=>g.id==='balance')?.records||[]).filter(r=>r.currency==='CNY').map(r=>({date:r.report_date,value:r.metrics.find(m=>m.id==='MONETARYFUNDS')?.value??null})).filter((r):r is {date:string;value:number}=>r.value!==null).reverse();
  const max=Math.max(1,...rows.map(r=>r.value));
  const points=rows.map((r,i)=>({x:42+i*300/Math.max(1,rows.length-1),y:120-85*r.value/max,...r}));
  return <div className="analysis-panel cash-trend"><div className="panel-caption">PUBLIC FINANCIALS / 公开财报</div><h3>货币资金 · 期末余额</h3>
    {rows.length?<><strong className="large-figure">{conciseMoney(rows[rows.length-1].value)}</strong><small>{rows[rows.length-1].date} · 东方财富 · 合并报表</small>
      <svg viewBox="0 0 390 155" role="img" aria-label="各报告期货币资金趋势，单位人民币"><line x1="32" y1="120" x2="365" y2="120" stroke="#a6ada4"/>{[35,75].map(y=><line key={y} x1="32" y1={y} x2="365" y2={y} stroke="#ccd0c8" strokeDasharray="4 6"/>)}<polyline points={points.map(p=>`${p.x},${p.y}`).join(' ')} stroke="#00846a" strokeWidth="2" fill="none"/>{points.map(p=><g key={p.date}><circle cx={p.x} cy={p.y} r="4" fill="#00846a"><title>{p.date}：{p.value.toLocaleString()} 元</title></circle><text x={p.x} y="144" textAnchor="middle" fontSize="10" fill="#626960">{p.date.slice(2)}</text></g>)}</svg>
      <details><summary>查看图表数据</summary>{rows.map(r=><p key={r.date}>{r.date}：{r.value.toLocaleString()} 元</p>)}</details>
    </>:<div className="chart-empty">尚无可绘制的人民币货币资金数据<br/><small>取得财报后显示真实报告期趋势</small></div>}
    <p className="chart-note">货币资金可能含受限资金，不能直接视为可自由使用现金。</p>
  </div>;
}

export function AssessmentDashboard({subject}:{subject:Subject|null}) {
  if(!subject)return <section id="company-assessment" className="assessment assessment-empty" aria-label="公司四维评估"><span className="panel-caption">02 / COMPANY ASSESSMENT</span><h2>确认企业后，展开四维评估</h2><p>用名称片段或关键词搜索，在候选企业旁点击“评估这家企业”。现金、信用、依赖和口碑会在这里逐步补齐。</p></section>;
  return <AssessmentBody key={subject.identity+':'+subject.ticker+':'+subject.name} subject={subject}/>;
}

function AssessmentBody({subject}:{subject:Subject}) {
  const [data,setData]=useState<PublicFinancials|null>(subject.financials||null),[pending,setPending]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const [role,setRole]=useState<Role>('enterprise'),[selected,setSelected]=useState<Dimension>('cash'),[draft,setDraft]=useState<Draft>({});
  useEffect(()=>{
    if(subject.financials){setData(subject.financials);return;}
    const code=securityCode(subject.ticker);if(!code)return;
    const abort=new AbortController();setPending(true);setError('');
    loadPublicFinancials(code,AbortSignal.any([abort.signal,AbortSignal.timeout(18000)]))
      .then(value=>{if(!abort.signal.aborted)setData(value);})
      .catch(()=>{if(!abort.signal.aborted)setError('公开财报暂时未取到，可重试或补充资料。');})
      .finally(()=>{if(!abort.signal.aborted)setPending(false);});
    return()=>abort.abort();
  },[subject.ticker,subject.financials,retry]);
  const qcc=subject.qcc;
  const checks=evaluate(data,qcc,draft),report=summary(checks,role);
  const filled=checks.filter(c=>c.level!=='unknown').length;
  const update=(id:string,value:string)=>setDraft(d=>({...d,[id]:value}));
  const invalid=Object.values(fields).flat().filter(f=>!f.options&&draft[f.id]?.trim()&&( !Number.isFinite(Number(draft[f.id]))||Number(draft[f.id])<0||Number(draft[f.id])>(f.max??Number.MAX_SAFE_INTEGER)));
  const oldest=data?.groups.flatMap(g=>g.records.slice(0,1)).some(r=>new Date(r.report_date).getTime()<Date.now()-366*86400000);
  return <section id="company-assessment" className={'assessment'+(role==='senior'?' large-type':'')} aria-label="公司四维评估">
    <header className="assessment-header"><div><span className="panel-caption">02 / COMPANY ASSESSMENT</span><h2>{subject.name}<span className="assessment-code">{subject.ticker||'待核实主体'}</span></h2><p>四维核对台 · 来源驱动 · 缺失项保留未知</p></div><div className="coverage-number"><strong>{filled}<span> / {checks.length}</span></strong><small>已获数据或补充线索 · 不等于风险评分</small></div></header>
    <div className="role-switch" aria-label="总结反馈对象">{roles.map(r=><button key={r.id} aria-pressed={role===r.id} onClick={()=>setRole(r.id)}>{r.label}</button>)}</div>
    {subject.identity==='manual'&&<p className="assessment-notice">当前企业名称由用户输入，尚未完成工商主体核验。</p>}
    {pending&&<p role="status">正在汇集这家企业的公开财报…</p>}
    {error&&<p role="alert">{error} <button className="ghost" onClick={()=>setRetry(v=>v+1)}>重试财报</button></p>}
    {oldest&&<p className="assessment-notice">部分财报期末距今超过一年，不能据此断言当前经营状态。请补充较新资料。</p>}
    <div className="dimension-strip">{dimensions.map(d=>{const items=checks.filter(c=>c.dimension===d.id),attention=items.filter(c=>c.level==='attention').length,unknown=items.filter(c=>c.level==='unknown').length;return <button className={selected===d.id?'selected':''} key={d.id} aria-pressed={selected===d.id} onClick={()=>setSelected(d.id)}><span>{d.title}</span><strong>{attention?`${attention} 项需关注`:unknown===items.length?'待补齐':unknown?`${unknown} 项待补齐`:'已获核对线索'}</strong><small>{items.length-unknown}/{items.length} 项有数据或补充</small></button>;})}</div>
    <div className="analysis-grid"><CashTrend data={data}/><div className="analysis-panel evidence-network"><div className="panel-caption">EVIDENCE MAP / 证据关系</div><h3>四个角度，逐项看依据</h3><EvidenceGraph checks={checks} selected={selected} onSelect={setSelected}/><div className="graph-legend">{Object.entries(levelText).map(([k,v])=><span key={k}><i style={{background:colors[k as keyof typeof colors]}}/>{v}</span>)}</div></div>
      <aside className="analysis-panel audience-feedback" aria-live="polite"><div className="panel-caption">YOUR BRIEF / {roles.find(r=>r.id===role)?.label}</div><h3>{report.headline}</h3><p>{report.intro}</p><p className="feedback-finding">{report.finding}</p><p>{report.missing}</p><h4>下一步先做这几件事</h4><ol>{report.actions.map((a,i)=><li key={i}>{a}</li>)}</ol><small>切换对象只改变表达与关注点，事实和参考线保持一致。</small></aside>
    </div>
    <div className="assessment-detail"><div className="analysis-panel"><div className="panel-caption">CHECKLIST / 核对明细</div><h3>{dimensions.find(d=>d.id===selected)?.question}</h3><div className="check-list">{checks.filter(c=>c.dimension===selected).map(c=><article className={'check-row level-'+c.level} key={c.id}><div><h4>{c.label}</h4><span className="check-status">{levelText[c.level]}</span></div><strong>{c.value}</strong><p>{c.reason}</p><details><summary>依据与下一步</summary><p>来源：{c.source}</p><p>{c.next}</p></details></article>)}</div></div>
      <div className="analysis-panel evidence-editor"><div className="panel-caption">FILL THE GAPS / 补齐资料</div><h3>补充{dimensions.find(d=>d.id===selected)?.title}</h3><p>留空表示未知。补充内容仅用于当前浏览器会话，统一标记为未独立核验。</p>
        <label>资料来源或凭证说明<input value={draft.source||''} maxLength={240} placeholder="例如：工资与社保台账、员工调查" onChange={e=>update('source',e.target.value)}/></label>
        <label>统计期间与样本口径<input value={draft.period||''} maxLength={240} placeholder="例如：2025 年，100 名员工；投诉率按已售订单" onChange={e=>update('period',e.target.value)}/></label>
        {(!draft.source?.trim()||!draft.period?.trim())&&<small>填写来源和统计期间后，补充数值才参与评估。</small>}
        <div className="evidence-fields">{fields[selected].map(f=><label key={f.id}>{f.label}{f.unit?'（'+f.unit+'）':''}{f.options?<select value={draft[f.id]||''} onChange={e=>update(f.id,e.target.value)}><option value="">未知 / 未提供</option>{f.options.map(([v,t])=><option key={v} value={v}>{t}</option>)}</select>:<input type="number" min="0" max={f.max} step="any" value={draft[f.id]||''} placeholder="未提供" onChange={e=>update(f.id,e.target.value)}/>}</label>)}</div>
        {selected==='cash'&&<small>现金与各项支出均用万元；无此项请明确填 0。月均支出需要与可用现金处于同一主体、相匹配的计划时点。</small>}
        {selected==='reputation'&&<small>认可度：认可人数 / 有效调查人数；离职率：期间离职人数 / 平均在岗人数；投诉率：投诉订单 / 已售订单。请在统计口径中注明实际分母。</small>}
        {invalid.length>0&&<p role="alert">以下输入超出有效范围，未参与评估：{invalid.map(f=>f.label).join('、')}</p>}
        <button className="ghost" onClick={()=>setDraft({})}>清空补充资料</button>
      </div>
    </div>
    <details className="assessment-basis"><summary>参考线、数据来源与评估范围</summary><p>规则来源：用户提供的杭州银行访谈反馈，未核验为银行统一授信标准。现金覆盖参考 3–6 个月；资产负债率参考约 40%；纳税信用参考 A/B；员工认可度至少 80%、离职率不超过 15%；货款逾期不超过 30 天；投诉率不超过 10%。不同企业及行业需另行核对。</p><p>客户集中度、“大量质押”“频繁股权变化”未给出统一数值线，必须补充比例、时间和事件背景。图中连接表示核对维度与项目，不是股权网络，也不是预测违约的模型。</p>{data&&<p><a href={data.source_url} target="_blank" rel="noreferrer">东方财富公开财报来源 ↗</a> · 获取 {new Date(data.retrieved_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}。报告期末余额与期间累计现金流不同；当前资料不写入历史证据。</p>}{qcc&&<p>企查查获取时间 {qcc.retrieved_at}；空记录不代表不存在风险，需逐条核对原始公示。</p>}<p><a href="https://fgk.chinatax.gov.cn/zcfgk/c100012/c5240851/content.html" target="_blank" rel="noreferrer">税务部门纳税缴费信用管理办法 ↗</a>：A、B、M、C、D 分级；M 级不直接等于失信。</p></details>
  </section>;
}
