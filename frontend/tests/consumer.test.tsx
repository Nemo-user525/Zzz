import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../src/App';
import { api } from '../src/api/client';
import { consumerApi, type Analysis, type Discovery } from '../src/api/consumer';
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

it('defaults to consumer view, needs identity confirmation and never loads cashflow endpoints',async()=>{
  await selectCandidate();
  expect(consumerApi.analyse).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'查看企业变化'}));
  await screen.findByText('甲方调查结果');
  expect(consumerApi.analyse).toHaveBeenCalledWith('inv','a',expect.objectContaining({amount_yuan:null,service_duration_months:null,intent:'initial_purchase'}),expect.any(AbortSignal));
  expect(api.demo).not.toHaveBeenCalled(); expect(api.simulate).not.toHaveBeenCalled(); expect(api.compare).not.toHaveBeenCalled();
});

it('supports initial purchase, top up, renewal and source drawer',async()=>{
  await selectCandidate();
  for(const intent of ['top_up','renewal','explore','initial_purchase']) fireEvent.change(screen.getByLabelText('消费意图'),{target:{value:intent}});
  fireEvent.click(screen.getByRole('button',{name:'查看企业变化'}));
  await screen.findByText('甲方调查结果');
  fireEvent.click(screen.getByRole('button',{name:'查看依据（1）'}));
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(screen.getByText('甲方服务有限公司的公开材料')).toBeTruthy();
  fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('clears prior analysis on candidate or intent change',async()=>{
  await selectCandidate();fireEvent.click(screen.getByRole('button',{name:'查看企业变化'}));
  await screen.findByText('甲方调查结果');
  fireEvent.change(screen.getByLabelText('消费意图'),{target:{value:'renewal'}});
  expect(screen.queryByText('甲方调查结果')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'查看企业变化'}));await screen.findByText('甲方调查结果');
  fireEvent.click(screen.getByRole('radio',{name:'乙方服务有限公司'}));
  expect(screen.queryByText('甲方调查结果')).toBeNull();
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
