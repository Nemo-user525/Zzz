import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../src/App';
import { api } from '../src/api/client';
import { consumerApi, type Analysis, type Discovery } from '../src/api/consumer';
import { reportText, emptyVerification, verificationStorageKey, sourceUrl } from '../src/jianweiVerification';

const source={id:'s',title:'测试材料',url:'https://example.com/evidence',publisher:'测试来源',excerpt:'甲方服务有限公司的公开材料',published_at:null,date_semantics:'未知',fetched_at:'2026-10-02T01:00:00Z',verification_status:'search_excerpt' as const,channel:'public_web',purpose:'测试',page_status:'未读原文',cached:false};
const discovery:Discovery={investigation_id:'inv',query:'测试门店',location:'',generated_at:'2026-10-02T01:00:00Z',mode:'live_search',candidates:[{id:'a',name:'甲方服务有限公司',basis:'来源提及，关系待核实',source_ids:['s'],relationship_status:'待核实'},{id:'b',name:'乙方服务有限公司',basis:'另一个候选',source_ids:['s'],relationship_status:'待核实'}],sources:[source],trace:[],unknowns:[]};
const report:Analysis={analysis_id:'r',company_id:'a',generated_at:'2026-10-02T01:00:00Z',evidence_as_of:'2026-10-02T01:00:00Z',mode:'live_search_rules',fallback:false,coverage_status:'unverified_leads',identity:discovery.candidates[0],summary:'甲方调查结果',changes:[],questions:['门店由谁运营？'],unknowns:['门店归属未知'],sources:[source],trace:[],criteria:{status:'not_trained',sample_count:0,matches:[],limitation:'暂无适用训练样本'},counter_search_status:'未找到',counter_source_ids:[],agent_status:'未配置在线模型',agent_framework:'LangGraph',agent_model_used:false,agent_rounds:0,indicators:[{id:'coverage',label:'判断依据够不够',status:'partial',value:'1 条来源',explanation:'搜索摘要仍需核实',source_ids:['s'],missing:['原文'],agent_findings:[]}]};


beforeEach(()=>{
 sessionStorage.clear();window.history.replaceState({},'','/investigations/new');vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
 vi.spyOn(consumerApi,'capabilities').mockRejectedValue(new Error('not configured'));
 vi.spyOn(consumerApi,'discover').mockResolvedValue(structuredClone(discovery));
 vi.spyOn(consumerApi,'analyse').mockResolvedValue(structuredClone(report));
 vi.spyOn(api,'demo');vi.spyOn(api,'simulate');vi.spyOn(api,'compare');
});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
async function search(){render(<App/>);fireEvent.change(screen.getByLabelText('门店、品牌或公司名称'),{target:{value:'测试门店'}});fireEvent.click(screen.getByRole('button',{name:'查找经营主体'}));await screen.findByRole('radio',{name:'甲方服务有限公司'});}
async function confirm(){await search();fireEvent.click(screen.getByRole('radio',{name:'甲方服务有限公司'}));fireEvent.change(screen.getByLabelText('你核对主体的依据'),{target:{value:'营业执照名称一致'}});fireEvent.click(screen.getByRole('button',{name:'确认主体并查看证据'}));await screen.findByRole('region',{name:'证据时间线'});}
it('does not preselect a candidate and requires a confirmation basis',async()=>{
 await search();expect((screen.getByRole('radio',{name:'甲方服务有限公司'}) as HTMLInputElement).checked).toBe(false);
 fireEvent.click(screen.getByRole('radio',{name:'甲方服务有限公司'}));expect((screen.getByRole('button',{name:'确认主体并查看证据'}) as HTMLButtonElement).disabled).toBe(true);
 expect(consumerApi.analyse).not.toHaveBeenCalled();expect(api.demo).not.toHaveBeenCalled();expect(api.simulate).not.toHaveBeenCalled();expect(api.compare).not.toHaveBeenCalled();
});
it('allows unconfirmed identity without attributing corporate evidence or calling analysis',async()=>{
 await search();fireEvent.click(screen.getByRole('button',{name:'我无法确认主体，先看线索 ↗'}));
 await screen.findByRole('region',{name:'证据时间线'});expect(screen.getByText(/以下为关键词相关资料/)).toBeTruthy();expect(consumerApi.analyse).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'生成付款前核对卡 ↗'}));expect(screen.getByRole('region',{name:'付款前核对卡'})).toBeTruthy();expect(screen.getByRole('heading',{name:'07 · 查证记录'})).toBeTruthy();
});
it('shows honest source status, unknown dates and an accessible source drawer',async()=>{
 await confirm();expect(consumerApi.analyse).toHaveBeenCalledWith('inv','a',expect.objectContaining({amount_yuan:null}),expect.any(AbortSignal),expect.any(Function));
 expect(screen.getByText('0 条已核实事实')).toBeTruthy();expect(screen.getByText('公开日期未知')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'查看来源与核验详情 ↗'}));expect(screen.getByRole('dialog')).toBeTruthy();expect(screen.getByRole('link',{name:'打开原始链接 ↗'}).getAttribute('href')).toBe(source.url);fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});expect(screen.queryByRole('dialog')).toBeNull();
});
it('merges the selected entity assessment while preserving its low confidence and limitations',async()=>{
 vi.mocked(consumerApi.analyse).mockResolvedValue({...report,risk:{level:'undetermined',label:'材料不足待核对',explanation:'仅有未核实线索',reasons:[],limitations:['不能作为付款保证'],model:'test',model_assessed:true,reviewed_source_count:1,confidence:'low'}});
 await confirm();expect(screen.getByText('甲方调查结果')).toBeTruthy();expect(screen.getByText('材料不足待核对')).toBeTruthy();expect(screen.getByRole('heading',{name:'低确信度'})).toBeTruthy();expect(screen.getByText('不能作为付款保证')).toBeTruthy();expect(screen.getByText('0 条已核实事实')).toBeTruthy();
});
it('ignores stale search responses after editing input',async()=>{
 let finish!:(v:Discovery)=>void;vi.mocked(consumerApi.discover).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));render(<App/>);fireEvent.change(screen.getByLabelText('门店、品牌或公司名称'),{target:{value:'旧门店'}});fireEvent.click(screen.getByRole('button',{name:'查找经营主体'}));fireEvent.change(screen.getByLabelText('门店、品牌或公司名称'),{target:{value:'新门店'}});await act(async()=>finish(discovery));expect(screen.queryByRole('radio')).toBeNull();expect(window.location.pathname).toBe('/investigations/new');
});
it('drops an older company report after selecting another candidate',async()=>{
 let finish!:(v:Analysis)=>void;vi.mocked(consumerApi.analyse).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));await search();fireEvent.click(screen.getByRole('radio',{name:'甲方服务有限公司'}));fireEvent.change(screen.getByLabelText('你核对主体的依据'),{target:{value:'合同一致'}});fireEvent.click(screen.getByRole('button',{name:'确认主体并查看证据'}));fireEvent.click(screen.getByRole('radio',{name:'乙方服务有限公司'}));await act(async()=>finish(report));expect(screen.queryByRole('region',{name:'证据时间线'})).toBeNull();expect((screen.getByLabelText('你核对主体的依据') as HTMLInputElement).value).toBe('');
});
it('shows failure and empty results without sample substitution',async()=>{
 vi.mocked(consumerApi.discover).mockRejectedValueOnce(new Error('接口超时')).mockResolvedValueOnce({...discovery,candidates:[],sources:[]});render(<App/>);fireEvent.change(screen.getByLabelText('门店、品牌或公司名称'),{target:{value:'未覆盖门店'}});fireEvent.click(screen.getByRole('button',{name:'查找经营主体'}));await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'查找经营主体'}));await screen.findByText(/本次没有找到可确认的经营主体/);fireEvent.click(screen.getByRole('button',{name:'我无法确认主体，先看线索 ↗'}));expect(screen.getByText(/本次未取得可展示的资料/)).toBeTruthy();
});
it('retains inputs across story and method navigation and reload',async()=>{
 render(<App/>);fireEvent.change(screen.getByLabelText('门店、品牌或公司名称'),{target:{value:'草稿门店'}});fireEvent.click(screen.getByText('补充消费计划'));fireEvent.change(screen.getByLabelText('准备预付金额（元，选填）'),{target:{value:'3999'}});fireEvent.click(screen.getByRole('link',{name:'一次查证，如何开始 ↗'}));expect(screen.getByRole('heading',{name:/签字之前/})).toBeTruthy();fireEvent.click(screen.getByRole('link',{name:'← 返回，保留刚才填写的内容'}));expect((screen.getByLabelText('门店、品牌或公司名称') as HTMLInputElement).value).toBe('草稿门店');cleanup();render(<App/>);expect((screen.getByLabelText('准备预付金额（元，选填）') as HTMLInputElement).value).toBe('3999');
});
it('rejects unrelated report URLs and clears a record explicitly',async()=>{
 await confirm();fireEvent.click(screen.getByText('草稿管理'));fireEvent.click(screen.getByRole('button',{name:'清除本次记录'}));expect(JSON.parse(sessionStorage.getItem(verificationStorageKey)!).discovery).toBeNull();cleanup();window.history.replaceState({},'','/investigations/missing/report');render(<App/>);expect(screen.getByText('当前标签页没有这份查证记录')).toBeTruthy();
});
it('exports original time, unknown identity, source links and tailored questions without risk scores',()=>{
 const text=reportText({...emptyVerification,query:'示例',discovery,identityUnconfirmed:true,conditions:{...emptyVerification.conditions,intent:'renewal',amount_yuan:3999,service_duration_months:12}});expect(text).toContain('主体未确认');expect(text).toContain(source.url);expect(text).toContain('3,999 元');expect(text).toContain('12 个月');expect(text).toContain('原有余额');expect(text).toContain('0 条');expect(sourceUrl('javascript:alert(1)')).toBeNull();
});
it('exports merged findings only when the report belongs to the selected entity',()=>{
 const snapshot={...emptyVerification,query:'测试门店',discovery,selected:'a',confirmation:'合同抬头一致',report};
 expect(reportText(snapshot)).toContain('甲方调查结果');
 expect(reportText(snapshot)).toContain('搜索摘要仍需核实');
 expect(reportText({...snapshot,identityUnconfirmed:true})).not.toContain('甲方调查结果');
 expect(reportText({...snapshot,selected:'b'})).not.toContain('甲方调查结果');
});
it('cancels pending analysis without accepting a late response',async()=>{
 let finish!:(v:Analysis)=>void;vi.mocked(consumerApi.analyse).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));await search();fireEvent.click(screen.getByRole('radio',{name:'甲方服务有限公司'}));fireEvent.change(screen.getByLabelText('你核对主体的依据'),{target:{value:'执照一致'}});fireEvent.click(screen.getByRole('button',{name:'确认主体并查看证据'}));fireEvent.click(screen.getByRole('button',{name:'取消'}));await act(async()=>finish(report));await waitFor(()=>expect(screen.queryByRole('region',{name:'证据时间线'})).toBeNull());
});

it('opens a separate search page and preserves inputs through retry',async()=>{
 window.history.replaceState({},'','/');render(<App/>);
 vi.mocked(consumerApi.discover).mockRejectedValueOnce(new Error('公开查询暂时超时'));
 expect(window.location.pathname).toBe('/');
 expect(document.getElementById('intro')).toBeTruthy();
 expect(document.getElementById('about')).toBeNull();
 expect(screen.queryByLabelText('门店、品牌或公司名称')).toBeNull();
 expect(screen.queryByText('看一次完整查证 · 虚构示范')).toBeNull();
 fireEvent.click(screen.getByRole('link',{name:'search'}));
 expect(window.location.pathname).toBe('/investigations/new');
 expect(window.location.hash).toBe('');
 expect(document.getElementById('intro')).toBeNull();
 expect(screen.getByLabelText('门店、品牌或公司名称')).toBeTruthy();
 expect(screen.getByRole('combobox',{name:'消费意图'}).closest('details')?.open).toBe(false);
 fireEvent.click(screen.getByText('补充消费计划'));
 expect(screen.getByRole('combobox',{name:'消费意图'}).closest('details')?.open).toBe(true);
 fireEvent.change(screen.getByLabelText('门店、品牌或公司名称'),{target:{value:'测试门店'}});
 fireEvent.change(screen.getByLabelText(/城市／门店位置/),{target:{value:'杭州 西湖区'}});
 fireEvent.change(screen.getByLabelText('准备预付金额（元，选填）'),{target:{value:'2000'}});
 expect(consumerApi.discover).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'查找经营主体'}));
 await screen.findByRole('alert');
 expect(window.location.pathname + window.location.hash).toBe('/investigations/new');
 expect((screen.getByLabelText('门店、品牌或公司名称') as HTMLInputElement).value).toBe('测试门店');
 fireEvent.click(screen.getByRole('button',{name:'查找经营主体'}));
 await screen.findByRole('radio',{name:'甲方服务有限公司'});
 expect(window.location.pathname).toBe('/investigations/inv/identity');
 expect(consumerApi.discover).toHaveBeenLastCalledWith('测试门店','杭州 西湖区',expect.any(AbortSignal));
 expect(screen.getByRole('navigation',{name:'查证步骤'})).toBeTruthy();
 expect(JSON.parse(sessionStorage.getItem(verificationStorageKey)!).conditions.amount_yuan).toBe(2000);
 expect(consumerApi.analyse).not.toHaveBeenCalled();
});

it('positions an initial Intro link once without jumping after capability updates',async()=>{
 let finish!:(value:Awaited<ReturnType<typeof consumerApi.capabilities>>)=>void;
 vi.mocked(consumerApi.capabilities).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 window.history.replaceState({},'','/#intro');render(<App/>);
 const target=document.getElementById('intro')!;
 const scroll=vi.fn();Object.defineProperty(target,'scrollIntoView',{value:scroll});
 await waitFor(()=>expect(scroll).toHaveBeenCalledTimes(1));
 expect(scroll).toHaveBeenCalledWith({block:'start',behavior:'instant'});
 await act(async()=>finish({search:'available',qcc_configured:false,llm_mode:'unavailable',agent_framework:'LangGraph',agent_enabled:false,xiaohongshu:'unavailable',criteria:report.criteria}));
 expect(scroll).toHaveBeenCalledTimes(1);
 expect(screen.queryByLabelText('门店、品牌或公司名称')).toBeNull();
});

it('redirects the legacy search fragment to the independent query page',async()=>{
 window.history.replaceState({},'','/#investigate');render(<App/>);
 expect(window.location.pathname).toBe('/investigations/new');
 expect(window.location.hash).toBe('');
 expect(document.getElementById('intro')).toBeNull();
 expect(screen.getByLabelText('门店、品牌或公司名称')).toBeTruthy();
 expect(window.scrollTo).toHaveBeenCalledWith({top:0,behavior:'instant'});
});

it('opens method instantly with the relocated about content and a single footer',async()=>{
 window.history.replaceState({},'','/');render(<App/>);
 expect(screen.getByRole('heading',{name:/不同的眼睛/}).closest('main')).toBeTruthy();
 expect(screen.getByRole('heading',{name:'看见微小，才能看得更远。'}).closest('main')).toBeTruthy();
 fireEvent.click(screen.getByRole('link',{name:'method'}));
 expect(window.location.pathname).toBe('/method');
 expect(window.location.hash).toBe('');
 expect(screen.getByRole('heading',{name:/知道什么/})).toBeTruthy();
 expect(document.getElementById('about')).toBeTruthy();
 expect(screen.queryByRole('heading',{name:/不同的眼睛/})).toBeNull();
 expect(screen.queryByRole('heading',{name:'看见微小，才能看得更远。'})).toBeNull();
 expect(screen.getAllByRole('contentinfo')).toHaveLength(1);
 expect(screen.getByRole('link',{name:'method'}).className).toBe('is-active');
 expect(screen.getByRole('link',{name:'Intro'}).className).toBe('');
 await waitFor(()=>expect(window.scrollTo).toHaveBeenCalledWith({top:0,behavior:'instant'}));
});

it('returns from method to the same evidence record, including after a reload',async()=>{
 await confirm();
 fireEvent.click(screen.getByRole('link',{name:'方法与边界 ↗'}));
 expect(window.location.pathname).toBe('/method');
 expect(screen.getByRole('link',{name:'← 返回刚才的查证'}).getAttribute('href')).toBe('/investigations/inv/evidence');
 cleanup();render(<App/>);
 fireEvent.click(screen.getByRole('link',{name:'← 返回刚才的查证'}));
 expect(window.location.pathname).toBe('/investigations/inv/evidence');
 expect(screen.getByRole('region',{name:'证据时间线'})).toBeTruthy();
 expect(screen.getByText('用户确认依据：营业执照名称一致')).toBeTruthy();
 expect(consumerApi.discover).toHaveBeenCalledTimes(1);
});

it('starts another query without discarding the previous record or the new draft',async()=>{
 await confirm();fireEvent.click(screen.getByRole('button',{name:'生成付款前核对卡 ↗'}));
 fireEvent.click(screen.getByRole('button',{name:'再查一家'}));
 expect(window.location.pathname).toBe('/investigations/new');
 expect((screen.getByLabelText('门店、品牌或公司名称') as HTMLInputElement).value).toBe('');
 expect(JSON.parse(sessionStorage.getItem('jianwei-previous-verification-v1')!).query).toBe('测试门店');
 fireEvent.change(screen.getByLabelText('门店、品牌或公司名称'),{target:{value:'另一家草稿'}});
 fireEvent.click(screen.getByRole('button',{name:'返回上次查证'}));
 expect(window.location.pathname).toBe('/investigations/inv/evidence');
 expect(screen.getByRole('region',{name:'证据时间线'})).toBeTruthy();
 expect(JSON.parse(sessionStorage.getItem('jianwei-previous-verification-v1')!).query).toBe('另一家草稿');
});

it('keeps the original input when an empty identity result needs more detail',async()=>{
 vi.mocked(consumerApi.discover).mockResolvedValueOnce({...discovery,candidates:[],sources:[]});
 render(<App/>);fireEvent.change(screen.getByLabelText('门店、品牌或公司名称'),{target:{value:'同名门店'}});
 fireEvent.click(screen.getByRole('button',{name:'查找经营主体'}));
 await screen.findByRole('heading',{name:'本次没有找到可确认的经营主体'});
 fireEvent.click(screen.getByRole('button',{name:'补充地址或公司全称'}));
 expect(window.location.pathname).toBe('/investigations/new');
 expect((screen.getByLabelText('门店、品牌或公司名称') as HTMLInputElement).value).toBe('同名门店');
 expect(consumerApi.analyse).not.toHaveBeenCalled();
});

