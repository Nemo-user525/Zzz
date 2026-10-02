import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import {evaluate,summary,type Draft} from '../src/assessment';
import {AssessmentDashboard} from '../src/AssessmentDashboard';
import type {PublicFinancials} from '../src/api/publicFinancials';
import type {QccResult} from '../src/api/qcc';

afterEach(cleanup);
const provenance={source:'测试台账，未独立核验',period:'2025 年度，100 名有效调查对象'};
const financials:PublicFinancials={provider:'东方财富',status:'success',security_code:'000333.SZ',retrieved_at:'2026-10-02',cached:false,source_url:'https://emweb.eastmoney.com/',limitations:[],groups:[{id:'balance',title:'资产负债表',status:'success',message:'',records:[{company_name:'测试公司',report_date:'2026-06-30',report_name:'2026 中报',published_at:'2026-08-29',updated_at:null,currency:'CNY',metrics:[{id:'MONETARYFUNDS',label:'货币资金',value:100000000,unit:'amount'},{id:'debt_ratio',label:'资产负债率',value:64.8,unit:'percent'}]}]}]};
const check=(id:string,d:Draft={},data:PublicFinancials|null=null,qcc?:QccResult)=>evaluate(data,qcc,d).find(c=>c.id===id)!;

it('never treats missing data as positive reputation or public cash as freely usable',()=>{
  expect(evaluate(null,undefined,{}).every(c=>c.level==='unknown')).toBe(true);
  expect(check('runway',{},financials).level).toBe('unknown');
  expect(check('leverage',{},financials).value).toBe('64.80%');
  expect(check('leverage',{},financials).source).toContain('2026-06-30');
});
it('requires complete cash outflows and provenance; zero expenses do not imply infinite coverage',()=>{
  const d={...provenance,usable_cash:'60',rent:'2',wages:'4',purchases:'3',loans:'1',other:'0'};
  expect(check('runway',d).value).toBe('6.0 个月');
  expect(check('runway',{...d,other:''}).level).toBe('unknown');
  expect(check('runway',{...d,source:''}).level).toBe('unknown');
  expect(check('runway',{...d,rent:'0',wages:'0',purchases:'0',loans:'0'}).level).toBe('unknown');
  expect(check('runway',{...d,usable_cash:'29.9'}).level).toBe('attention');
  expect(check('runway',{...d,usable_cash:'30'}).level).toBe('reference');
});
it.each([['employee_approval','80','79.99'],['turnover','15','15.01'],['complaints','10','10.01'],['supplier_days','30','31']])('uses inclusive interview boundary for %s',(id,pass,fail)=>{
  expect(check(id,{...provenance,[id]:pass}).level).toBe('reference');
  expect(check(id,{...provenance,[id]:fail}).level).toBe('attention');
  expect(check(id,{...provenance,[id]:'-1'}).level).toBe('unknown');
});
it('does not invent a top-two concentration cutoff',()=>{
  expect(check('top2',{...provenance,top2:'90'}).level).toBe('observed');
  expect(check('top2',{...provenance,top2:'90',top2_limit:'60'}).level).toBe('attention');
  expect(check('top2',{...provenance,top2:'101'}).level).toBe('unknown');
});
it('zero credit records are unknown and a manual clearance does not erase conflicting source records',()=>{
  const qcc={retrieved_at:'2026-10-02',groups:[{id:'Penalty',available:true,returned_count:0,records:[]}]} as QccResult;
  expect(check('penalty',{},null,qcc).level).toBe('unknown');
  qcc.groups[0].returned_count=1;
  const result=check('penalty',{...provenance,penalty:'clear'},null,qcc);
  expect(result.level).toBe('attention');expect(result.value).toBe('来源之间需核对');
});
it('M tax class is a contextual clue, not an automatic adverse record',()=>{
  expect(check('tax',{...provenance,tax:'M'}).level).toBe('observed');
  expect(check('tax',{...provenance,tax:'B'}).level).toBe('reference');
});
it('audiences change priorities and wording without changing evidence or concern count',()=>{
  const checks=evaluate(financials,undefined,{...provenance,technology_person:'yes',wage_arrears:'yes'});
  const enterprise=summary(checks,'enterprise'),investor=summary(checks,'investor'),senior=summary(checks,'senior');
  expect(enterprise.headline).toBe(investor.headline);expect(senior.headline).toBe(enterprise.headline);
  expect(enterprise.actions[0]).not.toBe(investor.actions[0]);
  expect(enterprise.finding.indexOf('拖欠工资')).toBeLessThan(enterprise.finding.indexOf('核心技术'));
  expect(investor.finding.indexOf('核心技术')).toBeLessThan(investor.finding.indexOf('拖欠工资'));
});
it('shows the actual financial chart, supports larger text, and resets manual data for a different company',()=>{
  const view=render(<AssessmentDashboard subject={{name:'测试公司',ticker:'000333',identity:'catalog',financials}}/>);
  expect(screen.getByRole('img',{name:'各报告期货币资金趋势，单位人民币'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'老年人 / 大字版'}));
  expect(screen.getByRole('region',{name:'公司四维评估'}).className).toContain('large-type');
  fireEvent.change(screen.getByLabelText('资料来源或凭证说明'),{target:{value:'工资台账'}});
  fireEvent.change(screen.getByLabelText('统计期间与样本口径'),{target:{value:'2025 年'}});
  fireEvent.change(screen.getByLabelText('可自由使用现金（万元）'),{target:{value:'60'}});
  view.rerender(<AssessmentDashboard subject={{name:'另一企业',ticker:'',identity:'manual'}}/>);
  expect((screen.getByLabelText('资料来源或凭证说明') as HTMLInputElement).value).toBe('');
  expect(screen.queryByRole('img',{name:'各报告期货币资金趋势，单位人民币'})).toBeNull();
});
it('reputation feedback reacts to sourced user input in the same view',()=>{
  render(<AssessmentDashboard subject={{name:'待核实企业',ticker:'',identity:'manual'}}/>);
  const strip=screen.getByRole('button',{name:/^员工、供应商与消费者/});fireEvent.click(strip);
  fireEvent.change(screen.getByLabelText('资料来源或凭证说明'),{target:{value:'调查记录'}});
  fireEvent.change(screen.getByLabelText('统计期间与样本口径'),{target:{value:'2025 年，100 个样本'}});
  fireEvent.change(screen.getByLabelText('员工认可度（%）'),{target:{value:'70'}});
  expect(screen.getByRole('heading',{name:'1 项需要进一步关注'})).toBeTruthy();
  const row=screen.getByRole('heading',{name:'员工认可度'}).closest('article')!;
  expect(within(row).getByText('70%')).toBeTruthy();
});
