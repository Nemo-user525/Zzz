import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../src/App';
import { api } from '../src/api/client';
import { consumerApi, type Analysis, type Discovery, type RiskAnalysis } from '../src/api/consumer';
import fixture from '../src/api/fixtures/baseline.json';

const source={id:'s',title:'测试材料',url:'https://example.com/evidence',publisher:'测试来源',excerpt:'甲方服务有限公司的公开材料',published_at:null,date_semantics:'未知',fetched_at:'2026-10-02T01:00:00Z',verification_status:'search_excerpt' as const,channel:'public_web',purpose:'测试',page_status:'未读原文',cached:false};
const discovery:Discovery={investigation_id:'inv',query:'测试门店',location:'',generated_at:'2026-10-02T01:00:00Z',mode:'live_search',candidates:[{id:'a',name:'甲方服务有限公司',basis:'来源提及，关系待核实',source_ids:['s'],relationship_status:'待核实'},{id:'b',name:'乙方服务有限公司',basis:'另一个候选',source_ids:['s'],relationship_status:'待核实'}],sources:[source],trace:[],unknowns:[]};
const report:Analysis={analysis_id:'r',company_id:'a',generated_at:'2026-10-02T01:00:00Z',evidence_as_of:'2026-10-02T01:00:00Z',mode:'live_search_rules',fallback:false,coverage_status:'unverified_leads',identity:discovery.candidates[0],summary:'甲方调查结果',changes:[],questions:['门店由谁运营？'],unknowns:['门店归属未知'],sources:[source],trace:[],criteria:{status:'not_trained',sample_count:0,matches:[],limitation:'暂无适用训练样本'},counter_search_status:'未找到',counter_source_ids:[],agent_status:'未配置在线模型',agent_framework:'LangGraph',agent_model_used:false,agent_rounds:0,indicators:[{id:'coverage',label:'判断依据够不够',status:'partial',value:'1 条来源',explanation:'搜索摘要仍需核实',source_ids:['s'],missing:['原文'],agent_findings:[]}]};

beforeEach(()=>{
  window.history.replaceState({},'','/');
  vi.spyOn(api,'useCases').mockResolvedValue(fixture.useCases);
  vi.spyOn(consumerApi,'capabilities').mockRejectedValue(new Error('not configured'));
  vi.spyOn(consumerApi,'discover').mockResolvedValue(structuredClone(discovery));
  vi.spyOn(consumerApi,'analyse').mockResolvedValue(structuredClone(report));
  vi.spyOn(api,'demo'); vi.spyOn(api,'simulate'); vi.spyOn(api,'compare');
});
afterEach(()=>cleanup());

async function selectCandidate(){
  render(<App/>);
  fireEvent.change(screen.getByLabelText('门店、品牌或公司名称'),{target:{value:'测试门店'}});
  fireEvent.click(screen.getByRole('button',{name:'查找经营主体'}));
  fireEvent.click(await screen.findByRole('radio',{name:'甲方服务有限公司'}));
}

it('opens result sections as pages and returns to the summary',async()=>{
  await selectCandidate();
  fireEvent.click(screen.getByRole('button',{name:'查看企业变化'}));
  await screen.findByRole('heading',{name:'中等风险，慎重！！！'});
  expect(screen.queryByRole('heading',{name:'全部证据'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:/全部证据/}));
  expect(screen.getByRole('heading',{name:'全部证据'})).toBeTruthy();
  expect(screen.getByText(source.excerpt)).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'← 返回查询结果'}));
  expect(screen.getByRole('heading',{name:'中等风险，慎重！！！'})).toBeTruthy();
  expect(screen.queryByRole('heading',{name:'全部证据'})).toBeNull();
});


it('keeps reviews and cashflow in separate pages',async()=>{
  const enriched:RiskAnalysis={...report,
    risk:{level:'medium',label:'中等风险 · 需核实',explanation:'当前材料存在有待核实的服务线索。',reasons:[],limitations:[],model:'local-test',model_assessed:true,reviewed_source_count:1,confidence:'low',confidence_label:'低确信度',review_impact:'评价中的退款问题需要核对后续。',cashflow_impact:'缺少真实收支，只能检验条件压力。'},
    reviews:{status:'completed',collected_count:1,reviewed_count:1,independent_content_count:1,counts:{negative:1},observations:[{source_id:'s',kind:'customer_feedback',sentiment:'negative',summary:'用户反馈存在退款问题，尚待核实。',quote:source.excerpt,scope:'brand_context',duplicate_of:null}],limitation:'仅限本次公开材料'},
    cashflow:{mode:'sensitivity_only',unit:'指数，非企业实际金额',horizon_months:6,baseline:{period:'未知',description:'基线是试算假设'},facts:[],driver_source_ids:['s'],limitations:['不代表企业真实未来金额'],scenarios:[{name:'收款承压情景',inflow_change_pct:-20,outflow_change_pct:10,assumption:'试算假设',cumulative_net_min:-100,cumulative_net_max:50,months:[{month:1,inflow:100,outflow_min:80,outflow_max:120,net_min:-20,net_max:20}]}]}};
  vi.mocked(consumerApi.analyse).mockResolvedValue(enriched);
  await selectCandidate();fireEvent.click(screen.getByRole('button',{name:'查看企业变化'}));
  await screen.findByRole('heading',{name:'中等风险，慎重！！！'});
  fireEvent.click(screen.getByRole('button',{name:/消费者怎么说/}));
  expect(screen.getByText('已审阅 1 / 1 条材料')).toBeTruthy();
  expect(screen.queryByText('收款承压情景',{selector:'th'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'← 返回查询结果'}));
  fireEvent.click(screen.getByRole('button',{name:/未来收支试算/}));
  expect(screen.getByText('收款承压情景',{selector:'th'})).toBeTruthy();
  expect(screen.queryByText('已审阅 1 / 1 条材料')).toBeNull();
  expect(enriched.risk?.confidence).toBe('low');
});


it('needs identity confirmation before analysis and retains the analysis request',async()=>{
  await selectCandidate();
  expect(consumerApi.analyse).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'查看企业变化'}));
  await screen.findByRole('heading',{name:'中等风险，慎重！！！'});
  expect(consumerApi.analyse).toHaveBeenCalledWith('inv','a',expect.objectContaining({amount_yuan:null,service_duration_months:null,intent:'initial_purchase'}),expect.any(AbortSignal),expect.any(Function));
  fireEvent.click(screen.getByRole('button',{name:/这家公司是谁/}));
  expect(screen.getByText('甲方调查结果')).toBeTruthy();
  expect(api.demo).not.toHaveBeenCalled(); expect(api.simulate).not.toHaveBeenCalled(); expect(api.compare).not.toHaveBeenCalled();
});


it('opens evidence details as a page with a return button',async()=>{
  await selectCandidate();
  for(const intent of ['top_up','renewal','explore','initial_purchase']) fireEvent.change(screen.getByLabelText('消费意图'),{target:{value:intent}});
  fireEvent.click(screen.getByRole('button',{name:'查看企业变化'}));
  await screen.findByRole('heading',{name:'中等风险，慎重！！！'});
  fireEvent.click(screen.getByRole('button',{name:/全部证据/}));
  fireEvent.click(screen.getByRole('button',{name:'查看详情（1）'}));
  expect(screen.getByRole('heading',{name:'证据详情'})).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'← 返回上一页'}));
  expect(screen.getByRole('heading',{name:'全部证据'})).toBeTruthy();
});


it('returns to the query form for a new analysis',async()=>{
  await selectCandidate();fireEvent.click(screen.getByRole('button',{name:'查看企业变化'}));
  await screen.findByRole('heading',{name:'中等风险，慎重！！！'});
  fireEvent.click(screen.getByRole('button',{name:'重新查询'}));
  fireEvent.change(screen.getByLabelText('消费意图'),{target:{value:'renewal'}});
  expect(screen.queryByRole('heading',{name:'中等风险，慎重！！！'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'查看企业变化'}));
  await screen.findByRole('heading',{name:'中等风险，慎重！！！'});
  expect(consumerApi.analyse).toHaveBeenLastCalledWith('inv','a',expect.objectContaining({intent:'renewal'}),expect.any(AbortSignal),expect.any(Function));
});


it('ignores a stale response after the query changes',async()=>{
  let finish!:(x:Discovery)=>void;
  vi.mocked(consumerApi.discover).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  render(<App/>);
  fireEvent.change(screen.getByLabelText('门店、品牌或公司名称'),{target:{value:'旧门店'}});
  fireEvent.click(screen.getByRole('button',{name:'查找经营主体'}));
  fireEvent.change(screen.getByLabelText('门店、品牌或公司名称'),{target:{value:'新门店'}});
  await act(async()=>{finish(discovery);});
  expect(screen.queryByRole('radio',{name:'甲方服务有限公司'})).toBeNull();
});

it('shows failed queries and empty results without successful fixture substitution',async()=>{
  vi.mocked(consumerApi.discover).mockRejectedValueOnce(new Error('接口超时')).mockResolvedValueOnce({...discovery,candidates:[],sources:[]});
  render(<App/>);
  fireEvent.change(screen.getByLabelText('门店、品牌或公司名称'),{target:{value:'未覆盖门店'}});
  fireEvent.click(screen.getByRole('button',{name:'查找经营主体'}));
  await screen.findByRole('alert');
  expect(screen.queryByRole('radio')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'查找经营主体'}));
  await screen.findByText(/本次没有找到可确认的经营主体/);
  expect(consumerApi.analyse).not.toHaveBeenCalled();
});

it('drops an older company report arriving after user selects a different candidate',async()=>{
  let finish!:(x:Analysis)=>void;
  vi.mocked(consumerApi.analyse).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  await selectCandidate();fireEvent.click(screen.getByRole('button',{name:'查看企业变化'}));
  fireEvent.click(screen.getByRole('radio',{name:'乙方服务有限公司'}));
  await act(async()=>{finish(report);});
  await waitFor(()=>expect(screen.queryByText('甲方调查结果')).toBeNull());
});
