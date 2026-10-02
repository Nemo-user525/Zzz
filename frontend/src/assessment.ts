import type {PublicFinancials} from './api/publicFinancials';
import type {QccResult} from './api/qcc';

export type Subject = {name:string; ticker:string; identity:'catalog'|'manual'|'qcc'; financials?:PublicFinancials; qcc?:QccResult};
export type Level = 'reference'|'attention'|'observed'|'unknown';
export type Role = 'enterprise'|'investor'|'beginner'|'senior';
export type Dimension = 'cash'|'credit'|'dependency'|'reputation';
export type Draft = Record<string,string>;
export type Check = {id:string; dimension:Dimension; label:string; value:string; level:Level; reason:string; source:string; next:string};
export const dimensions: {id:Dimension; title:string; question:string}[] = [
  {id:'cash',title:'现金与负债',question:'账上的钱，能撑多久？'},
  {id:'credit',title:'信用与治理',question:'有哪些记录需要核验？'},
  {id:'dependency',title:'客户与人员依赖',question:'业务是否离不开少数客户或某个人？'},
  {id:'reputation',title:'员工、供应商与消费者',question:'承诺有没有兑现？'},
];
export const levelText:Record<Level,string>={reference:'符合所填参考',attention:'需要关注',observed:'已获线索',unknown:'资料不足'};
export function number(value:string|undefined, max=Number.MAX_SAFE_INTEGER):number|null {
  if(value === undefined || value.trim()==='') return null;
  const n=Number(value); return Number.isFinite(n)&&n>=0&&n<=max?n:null;
}
export function evaluate(data:PublicFinancials|null, qcc:QccResult|undefined, d:Draft):Check[] {
  const checks:Check[]=[];
  const ready=!!d.source?.trim()&&!!d.period?.trim();
  const manual=ready?`用户补充（未独立核验）· ${d.period} · ${d.source}`:'尚需补充资料来源和统计期间';
  const n=(key:string,max=Number.MAX_SAFE_INTEGER)=>ready?number(d[key],max):null;
  const text=(key:string)=>ready?d[key]||'unknown':'unknown';
  const add=(id:string,dimension:Dimension,label:string,value:string,level:Level,reason:string,source:string,next:string)=>checks.push({id,dimension,label,value,level,reason,source,next});
  const latest=data?.groups.find(g=>g.id==='balance'&&g.status==='success')?.records[0];
  const metric=(id:string)=>latest?.metrics.find(m=>m.id===id)?.value??null;
  const money=n('usable_cash'), expenses=['rent','wages','purchases','loans','other'].map(k=>n(k));
  const monthly=expenses.every(v=>v!==null)?expenses.reduce<number>((s,v)=>s+(v??0),0):null;
  const months=money!==null&&monthly!==null&&monthly>0?money/monthly:null;
  add('runway','cash','现金覆盖月数',months===null?'待补充':`${months.toFixed(1)} 个月`,months===null?'unknown':months<3?'attention':'reference',months===null?'需要可自由使用现金和完整月均刚性支出，不能直接用财报货币资金替代。':months<3?'低于访谈的 3 个月参考下限。':months<6?'在 3–6 个月访谈参考区间内。':'按所填支出可覆盖至少 6 个月。',manual,'补齐未来 3–6 个月房租、工资、货款、贷款及其他刚性支出；月均法未反映集中到期。');
  const publicRatio=metric('debt_ratio'), ratio=n('debt_ratio',10000)??publicRatio;
  add('leverage','cash','资产负债率',ratio===null?'未提供':`${ratio.toFixed(2)}%`,ratio===null?'unknown':ratio>40?'attention':'reference',ratio===null?'缺少同一期总资产与总负债。':ratio>40?'高于约 40% 的访谈参考值，需结合行业和债务期限核对。':'不高于约 40% 的访谈参考值；较低不代表经营一定良好。',n('debt_ratio',10000)!==null?manual:latest?`东方财富 · ${latest.report_date} · 同一资产负债表计算`:'尚无财报','核对行业水平、受限资金与短期到期债务。');
  const record=(id:string,label:string,keys:string[])=>{
    const count=qcc?.groups.filter(g=>keys.includes(g.id)&&g.available).reduce((sum,g)=>sum+(g.returned_count??0),0)??0;
    const choice=text(id);
    const conflict=count>0&&choice==='clear';
    add(id,'credit',label,conflict?'来源之间需核对':choice==='flag'?'补充资料提示事项':choice==='clear'?'补充资料称已核验':count?`接口返回 ${count} 条线索`:'尚未完成核验',conflict||choice==='flag'||count>0?'attention':choice==='clear'?'reference':'unknown',conflict?`接口有 ${count} 条记录，但用户称所填期间未见事项；须核对期间、整改与解除状态。`:choice==='clear'?'按所填期间和来源，用户称未见相关事项，仍需核对原文。':count?'接口记录不能直接说明当前有效性、严重程度或是否已整改。':'查询无记录不等于不存在相关事项。',conflict?manual+'；企查查接口线索':choice!=='unknown'?manual:qcc?`企查查 · ${qcc.retrieved_at.slice(0,10)}`:'未取得信用资料','核对公示原文、主体、日期、处理状态。');
  };
  record('penalty','行政处罚与经营异常',['Penalty','Exceptions']);
  record('judicial','司法与失信',['ShiXinItems','ZhiXingItems']);
  record('pledge','抵押与股权出质',['MPledge','Pledge']);
  const taxRows=qcc?.groups.find(g=>g.id==='CompanyTaxCreditItems')?.records||[];
  const tax=taxRows.map(row=>({year:row.find(f=>f.label==='评价年度')?.value||'',grade:row.find(f=>f.label==='信用等级')?.value||''})).sort((a,b)=>b.year.localeCompare(a.year))[0];
  const grade=text('tax')!=='unknown'?text('tax'):tax?.grade||'';
  add('tax','credit','纳税信用',grade?`${grade} 级${tax&&text('tax')==='unknown'?' · '+tax.year:''}`:'未提供',['A','B'].includes(grade)?'reference':['C','D'].includes(grade)?'attention':grade?'observed':'unknown',grade==='M'?'M 级需结合适用情形核验，不直接当作失信。':'A 或 B 为本次访谈参考；注意评价年度与复评变化。',text('tax')!=='unknown'?manual:tax?'企查查 · 纳税信用记录':'未取得税务记录','补充最新年度税务评价或税务机关公示。');
  const flag=(id:string,dimension:Dimension,label:string,next:string)=>{const v=text(id);add(id,dimension,label,v==='yes'?'存在':v==='no'?'补充资料称不存在':'待核实',v==='yes'?'attention':v==='no'?'reference':'unknown','依据用户补充资料，不由公告缺失或员工人数推断。',manual,next);};
  flag('share_changes','credit','股权频繁更换','核对股权变更时间、比例、原因；工商变更不全部等于股权变更。');
  flag('heavy_pledge','credit','股东大量质押','补充质押股数、占所持股份比例及是否接近平仓条件。');
  const top=n('top2',100),limit=n('top2_limit',100);
  add('top2','dependency','前两大客户收入占比',top===null?'待补充':`${top}%`,top===null?'unknown':limit===null?'observed':top>limit?'attention':'reference',limit===null?'访谈未给出“高度依赖”的数值线，展示占比，不擅自判断。':`使用用户填写的 ${limit}% 参考上限。`,manual,'取得同一期间前两大客户收入和总营收，并识别关联客户。');
  flag('customer_person','dependency','客户资源依赖单一员工','核对客户关系是否有多人维护、合同及交接机制。');
  flag('technology_person','dependency','核心技术依赖单一员工','核对知识产权归属、技术文档、备岗和团队交付能力。');
  const percent=(id:string,label:string,boundary:number,minimum:boolean)=>{const v=n(id,100);add(id,'reputation',label,v===null?'待补充':`${v}%`,v===null?'unknown':(minimum?v>=boundary:v<=boundary)?'reference':'attention',`${minimum?'至少':'不超过'} ${boundary}% 为访谈参考；需有明确样本、分母和统计期间。`,manual,'补充调查或台账，注明样本量、统计期间及计算口径。');};
  percent('employee_approval','员工认可度',80,true);
  flag('wage_arrears','reputation','拖欠工资','核对工资支付记录和欠付是否已结清。');
  flag('social_arrears','reputation','拖欠社保','核对社保缴费凭证和欠缴情形。');
  percent('turnover','员工离职率',15,false);
  const overdue=n('supplier_days',36500);
  add('supplier_days','reputation','供应商货款最长逾期',overdue===null?'待补充':`${overdue} 天`,overdue===null?'unknown':overdue>30?'attention':'reference','按合同到期日计算逾期，不把约定账期误作拖欠；30 天为访谈参考。',manual,'补充应付账龄与逾期台账，核对是否长期反复拖欠。');
  percent('complaints','售后投诉率',10,false);
  const approval=n('consumer_approval',100);
  add('consumer_approval','reputation','产品认可度',approval===null?'待补充':`${approval}%`,approval===null?'unknown':'observed','访谈未指定认可度阈值；调查结果还需核对样本与口径。',manual,'补充消费者调查及有效样本数。');
  return checks;
}
export function summary(checks:Check[],role:Role) {
  const attention=checks.filter(c=>c.level==='attention'),unknown=checks.filter(c=>c.level==='unknown');
  const priorities:Record<Role,Dimension[]>={enterprise:['cash','reputation','credit','dependency'],investor:['cash','dependency','credit','reputation'],beginner:['cash','credit','dependency','reputation'],senior:['credit','cash','reputation','dependency']};
  const prioritized=[...(attention.length?attention:unknown)].sort((a,b)=>priorities[role].indexOf(a.dimension)-priorities[role].indexOf(b.dimension));
  const focus:Record<Role,string>={enterprise:'合作视角：先核对履约和付款条件，再谈订单规模与账期。',investor:'投资者视角：关注现金质量、债务结构和持续经营；本页不包含估值及买卖判断。',beginner:'小白视角：先看钱够不够，再看信用记录、业务依赖和各方反馈。',senior:'简明视角：先确认是哪家公司，再看钱、信用和口碑。公司的经营情况不等于任何产品保本。'};
  const firstAction:Record<Role,string>={enterprise:'把关注项与合同付款、交付和验收约定逐项核对；再用交易现金推演检查本方现金。',investor:'先查最新财报原文及附注，再核对同业和报告口径；经营核对不代替估值分析。',beginner:'先点开“依据与下一步”，看每个数从哪里来；灰色表示还不知道，不表示没问题。',senior:'先比对企业全称、合同和收款主体；看不清的条目可保留未知，逐项请对方出示原始资料。'};
  return {intro:focus[role],headline:attention.length?`${attention.length} 项需要进一步关注`:`${unknown.length? '资料尚未齐全':'已完成本次参考核对'}`,finding:attention.length?prioritized.slice(0,3).map(c=>`${c.label}：${c.value}`).join('；'):'现有资料未触发所填参考线，也不能据此认定企业可靠。',missing:`${unknown.length} / ${checks.length} 项资料不足。`,actions:[firstAction[role],...prioritized.slice(0,2).map(c=>c.next)]};
}
