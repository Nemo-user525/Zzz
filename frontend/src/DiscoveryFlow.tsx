import {useEffect,useMemo,useState} from 'react';
import type {FormEvent} from 'react';
import {discoveryApi as api} from './api/discovery';
import type {CompanyReport,IntegrationStatus,LegalEntity,Place,Region} from './api/discovery';

type Phase='search'|'places'|'entities'|'report';
const regionLabels=['省 / 直辖市','市 / 区','区 / 县','街道'];
const basicLabels:Record<string,string>={Name:'企业名称',Status:'登记状态',CreditCode:'统一社会信用代码',Address:'注册地址',StartDate:'成立日期',RegistCapi:'注册资本',OperName:'法定代表人',Scope:'经营范围',UpdatedDate:'资料更新日期','企业名称':'企业名称','登记状态':'登记状态','统一社会信用代码':'统一社会信用代码','注册地址':'注册地址','成立日期':'成立日期','注册资本':'注册资本','法定代表人':'法定代表人','经营范围':'经营范围'};
const riskLabels:Record<string,string>={Penalty:'行政处罚',Exceptions:'经营异常',ShiXinItems:'失信记录',ExecutedPerson:'被执行人',ChangeRecords:'变更记录',Branches:'分支机构',Partners:'股东',Employees:'主要人员'};
const message=(e:unknown)=>e instanceof Error?e.message:'服务暂时不可用，请稍后重试。';

function mapUrl(place:Place){
  if(!/^\d+(\.\d+)?,\d+(\.\d+)?$/.test(place.location))return '';
  return 'https://uri.amap.com/marker?'+new URLSearchParams({position:place.location,name:place.name,src:'xray-web',coordinate:'gaode',callnative:'0'});
}

function sourceId(tool:string){
  return tool==='get_company_registration_info'?'qcc-registration':tool==='get_company_risk_scan'?'qcc-risk-scan':'qcc-section-'+tool;
}

function openSource(tool:string){
  const section=document.getElementById(sourceId(tool));
  if(section instanceof HTMLDetailsElement)section.open=true;
}

function DiscoveryFlow({onCompanySelected}:{onCompanySelected?:(name:string)=>void}){
  const [status,setStatus]=useState<IntegrationStatus|null>(null);
  const [regions,setRegions]=useState<Region[][]>([[],[],[],[]]);
  const [selectedRegions,setSelectedRegions]=useState<string[]>(['','','','']);
  const [keyword,setKeyword]=useState('');
  const [intent,setIntent]=useState('首次办卡 / 买课');
  const [amount,setAmount]=useState('');
  const [months,setMonths]=useState('');
  const [places,setPlaces]=useState<Place[]>([]);
  const [selectedPlace,setSelectedPlace]=useState<Place|null>(null);
  const [entityQuery,setEntityQuery]=useState('');
  const [entities,setEntities]=useState<LegalEntity[]>([]);
  const [selectedEntity,setSelectedEntity]=useState<LegalEntity|null>(null);
  const [report,setReport]=useState<CompanyReport|null>(null);
  const [phase,setPhase]=useState<Phase>('search');
  const [loading,setLoading]=useState('');
  const [error,setError]=useState('');
  const [streetNote,setStreetNote]=useState('');
  const [entitySearchNote,setEntitySearchNote]=useState('');

  useEffect(()=>{
    let live=true;
    api.integrations().then(s=>{
      if(!live)return;
      setStatus(s);
      if(s.amap.configured)api.regions('100000').then(r=>live&&setRegions([r.regions,[],[],[]])).catch(()=>{});
    }).catch(e=>live&&setError(message(e)));
    return()=>{live=false};
  },[]);

  async function chooseRegion(index:number,value:string){
    const next=selectedRegions.map((v,i)=>i===index?value:i>index?'':v);
    setSelectedRegions(next);
    setRegions(prev=>prev.map((v,i)=>i>index?[]:v));
    if(!value||index>=3)return;
    const item=regions[index].find(r=>r.name===value);
    if(!item||item.level==='street')return;
    try{
      const result=await api.regions(item.adcode);
      setRegions(prev=>prev.map((v,i)=>i===index+1?result.regions:v));
    }catch(e){setError(message(e))}
  }

  const filter=useMemo(()=>{
    let regionCode='';let street='';
    selectedRegions.forEach((name,index)=>{
      const region=regions[index].find(r=>r.name===name);
      if(region?.level==='street')street=region.name;
      else if(region)regionCode=region.adcode;
    });
    return {regionCode,street};
  },[regions,selectedRegions]);

  async function searchPlaces(event:FormEvent){
    event.preventDefault();setError('');setLoading('places');setReport(null);setSelectedPlace(null);setEntities([]);
    try{
      const result=await api.places(keyword.trim(),filter.regionCode,filter.street);
      setPlaces(result.places);setStreetNote(result.street_filter_note);setPhase('places');
    }catch(e){setError(message(e))}finally{setLoading('')}
  }

  async function searchEntities(term:string){
    setEntityQuery(term);setError('');setLoading('entities');setEntities([]);setEntitySearchNote('');
    try{
      const result=await api.legalEntities(term.trim());
      setEntities(result.companies);setEntitySearchNote(result.search_note||'');setPhase('entities');
    }catch(e){setError(message(e));setPhase('entities')}finally{setLoading('')}
  }

  function choosePlace(place:Place){
    setSelectedPlace(place);setSelectedEntity(null);setReport(null);setPhase('entities');
    void searchEntities(place.name);
  }

  async function loadReport(entity:LegalEntity){
    if(!selectedPlace)return;
    setSelectedEntity(entity);setError('');setLoading('report');
    try{
      const value=await api.companyReport(entity.credit_code||entity.name,selectedPlace);
      setReport(value);setPhase('report');onCompanySelected?.(value.company_name);
    }catch(e){setError(message(e))}finally{setLoading('')}
  }

  async function loadManualReport(event:FormEvent){
    event.preventDefault();
    if(!selectedPlace||entityQuery.trim().length<2)return;
    await loadReport({key_no:'',name:entityQuery.trim(),credit_code:'',address:'',status:'',start_date:'',provider:'企查查'});
  }

  const mapLink=selectedPlace?mapUrl(selectedPlace):'';
  const rawFields=report?Object.entries(report.data):[];
  const lists=rawFields.filter(([,value])=>Array.isArray(value));
  const scalars=rawFields.filter(([,value])=>!Array.isArray(value)&&value!==null&&typeof value!=='object');
  const objects=rawFields.filter(([,value])=>value!==null&&!Array.isArray(value)&&typeof value==='object');
  const riskFactors=report&&Array.isArray(report.risk_scan?.['风险因子扫描'])?report.risk_scan['风险因子扫描'] as Record<string,unknown>[]:[];
  const isMcpReport=Boolean(report?.sections);
  const basicKeys=isMcpReport?['企业名称','登记状态','统一社会信用代码','注册地址','成立日期','注册资本','法定代表人','经营范围']:['Name','Status','CreditCode','Address','StartDate','RegistCapi','OperName','Scope'];
  const questions=[
    `合同上的经营者、营业执照主体和实际收款方是否都是“${report?.company_name||selectedEntity?.name||'同一家公司'}”？`,
    amount?`预计预付 ${amount} 元${months?`、服务 ${months} 个月`:''}，未使用部分如何计算和退还？`:'未使用的服务如何计算和退还？',
    '如果是分店或加盟店，闭店、转店时由谁继续履约？',
  ];

  return <div className="xr-flow" id="lookup">
    <div className="xr-flow-progress"><span className={phase==='search'?'active':''}>01 找门店</span><span className={phase==='places'?'active':''}>02 选地点</span><span className={phase==='entities'?'active':''}>03 选企业</span><span className={phase==='report'?'active':''}>04 看报告</span></div>
    {status&&<div className="xr-flow-status">高德地点：{status.amap.configured?'已配置':'待配置 Key'}　·　企查查：{status.qcc.configured?'已配置':'待配置授权与密钥'}</div>}
    {error&&<div className="xr-flow-error" role="alert">{error}</div>}

    <form className="xr-search-card xr-flow-form" onSubmit={searchPlaces}>
      <div className="xr-card-head"><span>START AN INVESTIGATION</span><span className="xr-live-pill"><i/> 实时查询</span></div>
      <h2>你想了解哪家店？</h2>
      <p>先从高德找到实际门店，再选择要分析的企业。办卡时请对照营业执照、合同和收款方名称。</p>
      <label className="xr-field"><span>门店 / 品牌关键词 <b>*</b></span><input value={keyword} onChange={e=>setKeyword(e.target.value)} placeholder="例如：某健身品牌" required minLength={2} maxLength={100}/></label>
      <div className="xr-flow-regions">{regionLabels.map((label,index)=><label className="xr-field" key={label}><span>{label} <small>可选</small></span><select value={selectedRegions[index]} disabled={!regions[index].length} onChange={e=>void chooseRegion(index,e.target.value)}><option value="">不限</option>{regions[index].map(r=><option key={`${r.name}-${r.adcode}`} value={r.name}>{r.name}</option>)}</select></label>)}</div>
      <fieldset className="xr-intents"><legend>这次准备做什么？</legend><div>{['首次办卡 / 买课','追加充值','续费','先了解一下'].map(v=><button type="button" key={v} className={intent===v?'active':''} onClick={()=>setIntent(v)}>{v}</button>)}</div></fieldset>
      <div className="xr-flow-money"><label className="xr-field"><span>预计预付金额 <small>元 · 可选</small></span><input type="number" min="0" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label className="xr-field"><span>服务时长 <small>月 · 可选</small></span><input type="number" min="1" max="240" value={months} onChange={e=>setMonths(e.target.value)}/></label></div>
      <button className="xr-submit" type="submit" disabled={loading==='places'||!status?.amap.configured}>{loading==='places'?'正在搜索高德地点…':'搜索实际门店'} <span>↗</span></button>
      {!status?.amap.configured&&<p className="xr-flow-hint">需要在服务端配置 AMAP_WEB_SERVICE_KEY；密钥不会发送到浏览器。</p>}
    </form>

    {phase!=='search'&&<section className="xr-flow-results" aria-live="polite">
      <div className="xr-flow-heading"><span>02 / 地点选择</span><h3>哪一家是你要查的门店？</h3><p>高德地点记录可帮助定位实际分店。请选择名称和地址相符的一家。</p></div>
      {streetNote&&<p className="xr-flow-hint">{streetNote}</p>}
      <div className="xr-flow-cards">{places.map(place=><article key={place.id} className={selectedPlace?.id===place.id?'chosen':''}><strong>{place.name}</strong><p>{[place.province,place.city,place.district,place.address].filter(Boolean).join(' · ')}</p><div><span>高德地图 · POI {place.id}</span><button type="button" onClick={()=>choosePlace(place)}>{selectedPlace?.id===place.id?'已选中':'选这家门店'} →</button></div></article>)}</div>
      {places.length===0&&<div className="xr-flow-empty">没有找到符合条件的门店。可清空街道、扩大地区或换一个关键词。</div>}
      {selectedPlace&&mapLink&&<div className="xr-flow-map"><img src={'/api/place-map?location='+encodeURIComponent(selectedPlace.location)} alt={`高德地图标记：${selectedPlace.name}`} loading="lazy"/><a href={mapLink} target="_blank" rel="noopener noreferrer">在高德地图查看地点 ↗</a></div>}
    </section>}

    {(phase==='entities'||phase==='report')&&selectedPlace&&<section className="xr-flow-results">
      <div className="xr-flow-heading"><span>03 / 企业选择</span><h3>选择要分析的企业</h3><p>按品牌名称查看企查查企业资料；如果你有合同或营业执照，可直接输入上面的企业全称。</p></div>
      <form className="xr-flow-entity-search" onSubmit={e=>{e.preventDefault();if(entityQuery.trim().length>=2)void searchEntities(entityQuery)}}><input aria-label="搜索企查查企业" value={entityQuery} onChange={e=>setEntityQuery(e.target.value)} minLength={2} placeholder="输入营业执照上的企业全称或统一社会信用代码"/><button disabled={loading==='entities'||!status?.qcc.configured}>{loading==='entities'?'查询中…':'搜索企业'}</button></form>
      {!status?.qcc.configured&&<p className="xr-flow-hint">企查查智能体未配置 API Key，企业候选与报告暂不可用。</p>}
      {entitySearchNote&&<p className="xr-flow-hint">{entitySearchNote}</p>}
      <div className="xr-flow-cards">{entities.map(entity=><article key={entity.key_no||entity.name} className={selectedEntity?.name===entity.name?'chosen':''}><strong>{entity.name}</strong><p>{[entity.status&&`登记状态：${entity.status}`,entity.credit_code&&`统一社会信用代码：${entity.credit_code}`].filter(Boolean).join(' · ')}</p>{entity.address&&<p>{entity.address}</p>}<div><span>企查查企业资料</span><button type="button" disabled={loading==='report'} onClick={()=>void loadReport(entity)}>获取企业报告 →</button></div></article>)}</div>
      {entities.length===0&&loading!=='entities'&&<div className="xr-flow-empty">试试品牌名称，或输入合同、营业执照上的企业全称。</div>}
      {loading==='report'&&<p className="xr-flow-hint">正在从企查查拉取工商资料、风险扫描及有记录项目的明细，请稍候…</p>}
      {selectedPlace&&status?.qcc.configured&&<form className="xr-flow-manual" onSubmit={e=>void loadManualReport(e)}><span>已知准确企业名称或统一社会信用代码？</span><button disabled={loading==='report'||entityQuery.trim().length<2}>{loading==='report'?'正在拉取报告…':'直接查询企业明细报告'}</button></form>}
    </section>}

    {report&&phase==='report'&&<section className="xr-flow-results xr-flow-report">
      <div className="xr-flow-heading"><span>04 / 企业报告</span><h3>{report.company_name}</h3><p>{report.provider} · 查询于 {new Date(report.queried_at).toLocaleString('zh-CN')}{report.order_number?` · 请求号 ${report.order_number}`:''}</p></div>
      {report.assessment&&<div className={'xr-flow-verdict xr-flow-verdict-'+report.assessment.level} aria-label="企业风险等级"><span>{report.assessment.title}</span><strong>{report.assessment.label}</strong><p className="xr-flow-verdict-action">{report.assessment.recommendation}</p><ul>{report.assessment.reasons.map((reason,index)=><li key={`${reason.tool}-${index}`}>{reason.text} <a href={'#'+sourceId(reason.tool)} onClick={()=>openSource(reason.tool)}>查看资料 ↗</a></li>)}</ul><small>{report.assessment.scope}</small></div>}
      <details className="xr-flow-report-scope"><summary>查看报告对象与资料范围</summary><p>{report.identity_note}</p><p>{report.coverage_note}</p>{Boolean(report.failed_sections?.length)&&<p>本次未取得：{report.failed_sections?.join('、')}。</p>}</details>
      <h4 id="qcc-registration">企业基本资料</h4><div className="xr-flow-facts">{basicKeys.filter(key=>report.data[key]!=null&&report.data[key]!=='').map(key=><div key={key}><span>{basicLabels[key]}</span><strong>{String(report.data[key])}</strong></div>)}</div>
      {isMcpReport?<>
        <h4>风险因子扫描 · {riskFactors.length} 项</h4>
        {report.risk_scan?<><p className="xr-flow-hint">以下是企查查扫描的命中数量；有记录的项目在下方逐项拉取明细。</p><div className="xr-flow-risk">{riskFactors.map((factor,index)=><div key={index}><b>{String(factor['风险因子']||'未命名风险因子')}</b><span>{factor['条目数']===0?'本次未命中':`${String(factor['条目数']??'—')} 条扫描记录`}</span></div>)}</div><details className="xr-flow-raw" id="qcc-risk-scan"><summary>查看风险扫描原始字段</summary><pre>{JSON.stringify(report.risk_scan,null,2)}</pre></details></>:<p className="xr-flow-hint">本次风险扫描暂不可用，建议以报告中的预付建议为准。</p>}
        <h4>企查查明细 · {report.sections?.length||0} 项</h4>
        <div className="xr-flow-fields">{report.sections?.map((section,index)=><details id={'qcc-section-'+section.tool} key={`${section.tool}-${index}`}><summary>{section.title} · {section.status==='returned'?'已返回':'未取得'}{section.scan_count!=null?` · 扫描 ${section.scan_count} 条`:''}</summary>{section.data?<pre>{JSON.stringify(section.data,null,2)}</pre>:<p>{section.message||'接口未返回明细'}</p>}</details>)}</div>
      </>:<><h4>重点记录</h4><div className="xr-flow-risk">{Object.entries(riskLabels).map(([key,label])=>{const value=report.data[key];return <div key={key}><b>{label}</b><span>{Array.isArray(value)?`${value.length} 条接口返回记录`:value==null?'接口未返回该字段':'查看完整字段'}</span></div>})}</div></>}
      <h4>工商登记原始字段{!isMcpReport?'与接口其他字段':''}</h4><p className="xr-flow-hint">以下保留本次接口返回的原字段和值，供逐项核对。</p>
      <div className="xr-flow-fields"><details><summary>基本字段 · {scalars.length} 项</summary><dl>{scalars.map(([key,value])=><div key={key}><dt>{basicLabels[key]||key}</dt><dd>{String(value)}</dd></div>)}</dl></details>{[...lists,...objects].map(([key,value])=><details key={key}><summary>{riskLabels[key]||key}{Array.isArray(value)?` · ${value.length} 条`:''}</summary><pre>{JSON.stringify(value,null,2)}</pre></details>)}</div>
      <h4>付款前建议核对</h4><ol className="xr-flow-questions">{questions.map(q=><li key={q}>{q}</li>)}</ol>
    </section>}
  </div>;
}

export default DiscoveryFlow;
