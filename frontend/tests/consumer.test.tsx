import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../src/App';
import { api } from '../src/api/client';
import { consumerApi, type Analysis, type Discovery } from '../src/api/consumer';
import { reportText, emptyVerification, verificationStorageKey, sourceUrl } from '../src/jianweiVerification';

const source={id:'s',title:'测试材料',url:'https://example.com/evidence',publisher:'测试来源',excerpt:'甲方服务有限公司的公开材料',published_at:null,date_semantics:'未知',fetched_at:'2026-10-02T01:00:00Z',verification_status:'search_excerpt' as const,channel:'public_web',purpose:'测试',page_status:'未读原文',cached:false};
const discovery:Discovery={investigation_id:'inv',query:'测试门店',location:'',generated_at:'2026-10-02T01:00:00Z',mode:'live_search',candidates:[{id:'a',name:'甲方服务有限公司',basis:'来源提及，关系待核实',source_ids:['s'],relationship_status:'待核实'},{id:'b',name:'乙方服务有限公司',basis:'另一个候选',source_ids:['s'],relationship_status:'待核实'}],sources:[source],trace:[],unknowns:[]};
const report:Analysis={analysis_id:'r',company_id:'a',generated_at:'2026-10-02T01:00:00Z',evidence_as_of:'2026-10-02T01:00:00Z',mode:'live_search_rules',fallback:false,coverage_status:'unverified_leads',identity:discovery.candidates[0],summary:'甲方调查结果',changes:[],questions:['门店由谁运营？'],unknowns:['门店归属未知'],sources:[source],trace:[],criteria:{status:'not_trained',sample_count:0,matches:[],limitation:'暂无适用训练样本'},counter_search_status:'未找到',counter_source_ids:[],agent_status:'未配置在线模型',agent_framework:'LangGraph',agent_model_used:false,agent_rounds:0,indicators:[{id:'coverage',label:'判断依据够不够',status:'partial',value:'1 条来源',explanation:'搜索摘要仍需核实',source_ids:['s'],missing:['原文'],agent_findings:[]}]};


beforeEach(()=>{
 // Workflow assertions skip the decorative welcome; its lifecycle has dedicated tests.
 vi.stubGlobal('matchMedia',vi.fn((query:string)=>({matches:query==='(prefers-reduced-motion: reduce)',media:query,onchange:null,addEventListener:vi.fn(),removeEventListener:vi.fn(),addListener:vi.fn(),removeListener:vi.fn(),dispatchEvent:vi.fn()})));
 sessionStorage.clear();window.history.replaceState({},'','/investigations/new');vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
 vi.spyOn(consumerApi,'capabilities').mockRejectedValue(new Error('not configured'));
 vi.spyOn(consumerApi,'discover').mockResolvedValue(structuredClone(discovery));
 vi.spyOn(consumerApi,'analyse').mockResolvedValue(structuredClone(report));
 vi.spyOn(api,'demo');vi.spyOn(api,'simulate');vi.spyOn(api,'compare');
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function search(){render(<App/>);fireEvent.change(screen.getByLabelText('门店、品牌或公司名称'),{target:{value:'测试门店'}});fireEvent.click(screen.getByRole('button',{name:'查找经营主体'}));await screen.findByRole('radio',{name:'甲方服务有限公司'});}
async function confirm(){await search();fireEvent.click(screen.getByRole('radio',{name:'甲方服务有限公司'}));fireEvent.click(screen.getByRole('button',{name:'确认主体并生成风险评估'}));await screen.findByRole('region',{name:'证据时间线'});}
it('keeps the original search loading message and allows the same name to be searched repeatedly',async()=>{
 const requests:{finish:(value:Discovery)=>void}[]=[];
 vi.mocked(consumerApi.discover).mockImplementation(()=>new Promise(resolve=>requests.push({finish:resolve})));
 render(<App/>);
 expect(screen.queryByText(/无需注册/)).toBeNull();
 fireEvent.change(screen.getByLabelText('门店、品牌或公司名称'),{target:{value:'同一家门店'}});
 fireEvent.click(screen.getByRole('button',{name:'查找经营主体'}));
 expect(screen.getByText('正在检索公开资料并识别候选主体。')).toBeTruthy();
 expect(screen.queryByRole('progressbar')).toBeNull();
 fireEvent.submit(screen.getByLabelText('门店、品牌或公司名称').closest('form')!);
 expect(consumerApi.discover).toHaveBeenCalledTimes(1);
 await act(async()=>requests[0].finish({...discovery,investigation_id:'first'}));
 await screen.findByRole('button',{name:'重新搜索'});
 expect(screen.queryByText('正在检索公开资料并识别候选主体。')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'重新搜索'}));
 expect(screen.getByText('正在检索公开资料并识别候选主体。')).toBeTruthy();
 await act(async()=>requests[1].finish({...discovery,investigation_id:'second'}));
 expect(window.location.pathname).toBe('/investigations/second/identity');
 expect(consumerApi.discover).toHaveBeenCalledTimes(2);
 expect(vi.mocked(consumerApi.discover).mock.calls.map(call=>call[0])).toEqual(['同一家门店','同一家门店']);
 expect(vi.mocked(consumerApi.discover).mock.calls[0][2]).not.toBe(vi.mocked(consumerApi.discover).mock.calls[1][2]);
 expect(screen.queryByRole('progressbar')).toBeNull();
 expect(screen.queryByText('正在检索公开资料并识别候选主体。')).toBeNull();
});
it('keeps the original analysis batch messages without a progress bar',async()=>{
 let finish!:(value:Analysis)=>void;
 let reportProgress!:(message:string)=>void;
 vi.mocked(consumerApi.analyse).mockImplementation((_id,_candidate,_conditions,_signal,onProgress)=>new Promise(resolve=>{finish=resolve;reportProgress=onProgress!;}));
 await search();
 fireEvent.click(screen.getByRole('radio',{name:'甲方服务有限公司'}));
 fireEvent.click(screen.getByRole('button',{name:'确认主体并生成风险评估'}));
 expect(screen.getByText('正在读取所选主体的资料，请稍候。')).toBeTruthy();
 act(()=>reportProgress('推理模型正在分批核对资料（1/4）…'));
 expect(screen.getByText('推理模型正在分批核对资料（1/4）…')).toBeTruthy();
 expect(screen.queryByRole('progressbar')).toBeNull();
 await act(async()=>finish(report));
 await screen.findByRole('region',{name:'证据时间线'});
 expect(screen.queryByRole('progressbar')).toBeNull();
 expect(screen.queryByText('推理模型正在分批核对资料（1/4）…')).toBeNull();
});
it('requires a deliberate candidate selection and confirmation click without a written basis',async()=>{
 await search();expect((screen.getByRole('radio',{name:'甲方服务有限公司'}) as HTMLInputElement).checked).toBe(false);
 expect((screen.getByRole('radio',{name:'乙方服务有限公司'}) as HTMLInputElement).checked).toBe(false);
 expect((screen.getByRole('button',{name:'确认主体并生成风险评估'}) as HTMLButtonElement).disabled).toBe(true);
 expect(screen.queryByLabelText('你核对主体的依据')).toBeNull();
 fireEvent.click(screen.getByRole('radio',{name:'甲方服务有限公司'}));expect((screen.getByRole('button',{name:'确认主体并生成风险评估'}) as HTMLButtonElement).disabled).toBe(false);
 expect(screen.queryByLabelText('你核对主体的依据')).toBeNull();
 expect(consumerApi.analyse).not.toHaveBeenCalled();expect(api.demo).not.toHaveBeenCalled();expect(api.simulate).not.toHaveBeenCalled();expect(api.compare).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'确认主体并生成风险评估'}));
 await screen.findByRole('region',{name:'证据时间线'});
 expect(consumerApi.analyse).toHaveBeenCalledExactlyOnceWith('inv','a',expect.objectContaining({amount_yuan:null}),expect.any(AbortSignal),expect.any(Function));
 expect(screen.queryByText(/用户确认依据：/)).toBeNull();
 const saved=JSON.parse(sessionStorage.getItem(verificationStorageKey)!);
 expect(saved.confirmation).toBe('');expect(saved.selected).toBe('a');
 expect(reportText(saved)).not.toContain('用户确认依据：');
});
it('allows unconfirmed identity without attributing corporate evidence or calling analysis',async()=>{
 await search();fireEvent.click(screen.getByRole('button',{name:'我无法确认主体，先看线索 ↗'}));
 await screen.findByRole('region',{name:'证据时间线'});expect(screen.getByText(/以下为关键词相关资料/)).toBeTruthy();expect(consumerApi.analyse).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'生成付款前核对卡 ↗'}));expect(screen.getByRole('region',{name:'付款前核对卡'})).toBeTruthy();expect(screen.getByRole('heading',{name:'06 · 查证记录'})).toBeTruthy();
});
it('gives an unconfirmed record a bounded medium payment decision and continues without rerunning discovery',async()=>{
 await search();fireEvent.click(screen.getByRole('button',{name:'我无法确认主体，先看线索 ↗'}));
 const summary=screen.getByRole('region',{name:'风险评估与总结'});
 expect(within(summary).getByText('中风险 · 预付决策建议')).toBeTruthy();
 expect(within(summary).getByText('建议控制预付金额，选择短期或按次支付。')).toBeTruthy();
 expect(within(summary).getByText('预付决策建议，不表示企业已发生经营问题')).toBeTruthy();
 expect(within(summary).getByText(/当前材料涉及品牌或同名主体/)).toBeTruthy();
 expect(screen.queryByText('尚未生成企业风险评估')).toBeNull();
 expect(summary.compareDocumentPosition(screen.getByRole('heading',{name:'经营主体'})) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 expect(screen.queryByRole('heading',{name:/低确信度|高风险|中等风险/})).toBeNull();
 fireEvent.click(within(summary).getByRole('button',{name:'核对主体，继续风险评估 →'}));
 expect(window.location.pathname).toBe('/investigations/inv/identity');
 expect(consumerApi.discover).toHaveBeenCalledTimes(1);expect(consumerApi.analyse).not.toHaveBeenCalled();
 expect(JSON.parse(sessionStorage.getItem(verificationStorageKey)!).discovery.sources).toHaveLength(1);
});
it('keeps source types, unknown dates and the source drawer without verified-fact counts in the headline',async()=>{
 await confirm();expect(consumerApi.analyse).toHaveBeenCalledWith('inv','a',expect.objectContaining({amount_yuan:null}),expect.any(AbortSignal),expect.any(Function));
 expect(screen.queryByText('0 条已核实事实')).toBeNull();expect(screen.getByText('公开日期未知')).toBeTruthy();
 expect(screen.getByText('搜索摘要')).toBeTruthy();
 expect(screen.getByText('1 条来源材料')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'查看来源与核验详情 ↗'}));expect(screen.getByRole('dialog')).toBeTruthy();expect(screen.getByRole('link',{name:'打开原始链接 ↗'}).getAttribute('href')).toBe(source.url);fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});expect(screen.queryByRole('dialog')).toBeNull();
});
it('leads with the selected company low-risk decision while preserving confidence and limitations in details',async()=>{
 vi.mocked(consumerApi.analyse).mockResolvedValue({...report,risk:{level:'low',label:'低风险',explanation:'现有资料显示经营稳定，履约记录持续良好。',reasons:[],limitations:['不能作为付款保证'],model:'test',model_assessed:true,reviewed_source_count:1,confidence:'low'}});
 await confirm();
 expect(screen.getByRole('heading',{name:'低风险'})).toBeTruthy();
 expect(screen.getByText('现有资料显示经营稳定，履约记录持续良好。')).toBeTruthy();
 expect(screen.getByText('可继续考虑，优先选择按次或短期购买。')).toBeTruthy();
 expect(screen.getByText('基于本次检索资料的风险初判')).toBeTruthy();
 expect(screen.getByText('甲方调查结果').closest('details')?.open).toBe(false);
 expect(screen.getByText('低确信度').closest('details')?.open).toBe(false);
 expect(screen.getByText('不能作为付款保证').closest('details')?.open).toBe(false);
 expect(screen.queryByText('0 条已核实事实')).toBeNull();
 expect(screen.getAllByRole('heading',{name:'风险结论'})).toHaveLength(1);
 expect(screen.getByRole('heading',{name:'风险结论'}).compareDocumentPosition(screen.getByRole('heading',{name:'经营主体'})) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 fireEvent.click(screen.getByText('查看资料范围与判断说明'));
 expect(screen.getByText('不能作为付款保证').closest('details')?.open).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'生成付款前核对卡 ↗'}));
 expect(screen.getByRole('heading',{name:'低风险'})).toBeTruthy();expect(screen.getByText('甲方调查结果')).toBeTruthy();expect(screen.getByText('不能作为付款保证')).toBeTruthy();
});
it('ignores stale search responses after editing input',async()=>{
 let finish!:(v:Discovery)=>void;vi.mocked(consumerApi.discover).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));render(<App/>);fireEvent.change(screen.getByLabelText('门店、品牌或公司名称'),{target:{value:'旧门店'}});fireEvent.click(screen.getByRole('button',{name:'查找经营主体'}));fireEvent.change(screen.getByLabelText('门店、品牌或公司名称'),{target:{value:'新门店'}});await act(async()=>finish(discovery));expect(screen.queryByRole('radio')).toBeNull();expect(window.location.pathname).toBe('/investigations/new');
});
it('drops an older company report after selecting another candidate',async()=>{
 let finish!:(v:Analysis)=>void;vi.mocked(consumerApi.analyse).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));await search();fireEvent.click(screen.getByRole('radio',{name:'甲方服务有限公司'}));fireEvent.click(screen.getByRole('button',{name:'确认主体并生成风险评估'}));
 const originalSignal=vi.mocked(consumerApi.analyse).mock.calls[0][3]!;
 fireEvent.click(screen.getByRole('radio',{name:'乙方服务有限公司'}));
 expect(originalSignal.aborted).toBe(true);
 await act(async()=>finish(report));expect(screen.queryByRole('region',{name:'证据时间线'})).toBeNull();
 expect((screen.getByRole('radio',{name:'乙方服务有限公司'}) as HTMLInputElement).checked).toBe(true);
 expect((screen.getByRole('button',{name:'确认主体并生成风险评估'}) as HTMLButtonElement).disabled).toBe(false);
 expect(screen.queryByLabelText('你核对主体的依据')).toBeNull();
 expect(consumerApi.analyse).toHaveBeenCalledTimes(1);expect(JSON.parse(sessionStorage.getItem(verificationStorageKey)!).report).toBeNull();
});
it('shows failure and empty results without sample substitution',async()=>{
 vi.mocked(consumerApi.discover).mockRejectedValueOnce(new Error('接口超时')).mockResolvedValueOnce({...discovery,candidates:[],sources:[]});render(<App/>);fireEvent.change(screen.getByLabelText('门店、品牌或公司名称'),{target:{value:'未覆盖门店'}});fireEvent.click(screen.getByRole('button',{name:'查找经营主体'}));await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'查找经营主体'}));await screen.findByText(/本次没有找到可确认的经营主体/);fireEvent.click(screen.getByRole('button',{name:'我无法确认主体，先看线索 ↗'}));expect(screen.getByText(/本次未取得可展示的资料/)).toBeTruthy();
});
it('retains inputs across story and method navigation and reload',async()=>{
 render(<App/>);fireEvent.change(screen.getByLabelText('门店、品牌或公司名称'),{target:{value:'草稿门店'}});fireEvent.change(screen.getByLabelText('准备预付金额（元，选填）'),{target:{value:'3999'}});fireEvent.click(screen.getByRole('link',{name:'一次查证，如何开始 ↗'}));expect(screen.getByRole('heading',{name:/签字之前/})).toBeTruthy();fireEvent.click(screen.getByRole('link',{name:'← 返回，保留刚才填写的内容'}));expect((screen.getByLabelText('门店、品牌或公司名称') as HTMLInputElement).value).toBe('草稿门店');cleanup();render(<App/>);expect((screen.getByLabelText('准备预付金额（元，选填）') as HTMLInputElement).value).toBe('3999');
});
it('rejects unrelated report URLs and clears a record explicitly',async()=>{
 await confirm();fireEvent.click(screen.getByText('草稿管理'));fireEvent.click(screen.getByRole('button',{name:'清除本次记录'}));expect(JSON.parse(sessionStorage.getItem(verificationStorageKey)!).discovery).toBeNull();cleanup();window.history.replaceState({},'','/investigations/missing/report');render(<App/>);expect(screen.getByText('当前标签页没有这份查证记录')).toBeTruthy();
});
it('exports a bounded risk conclusion, original time, identity context, source links and tailored questions',()=>{
 const text=reportText({...emptyVerification,query:'示例',discovery,identityUnconfirmed:true,conditions:{...emptyVerification.conditions,intent:'renewal',amount_yuan:3999,service_duration_months:12}});expect(text).toContain('主体未确认');expect(text).toContain(source.url);expect(text).toContain('3,999 元');expect(text).toContain('12 个月');expect(text).toContain('原有余额');expect(sourceUrl('javascript:alert(1)')).toBeNull();
 expect(text).toContain('# 见微 · 风险判断卡');expect(text).toContain('## 1. 风险结论');
 expect(text).toContain('中风险');expect(text).toContain('建议控制预付金额，选择短期或按次支付。');
 expect(text).toContain('预付决策建议，不表示企业已发生经营问题');
 expect(text).not.toContain('0 条已核实事实');expect(text).not.toContain('尚未生成企业风险评估');
});
it('exports merged findings only when the report belongs to the selected entity',()=>{
 const snapshot={...emptyVerification,query:'测试门店',discovery,selected:'a',confirmation:'合同抬头一致',report};
 expect(reportText(snapshot)).toContain('甲方调查结果');
 expect(reportText(snapshot)).toContain('搜索摘要仍需核实');
 expect(reportText(snapshot)).toContain('用户确认依据：合同抬头一致');
 expect(reportText({...snapshot,identityUnconfirmed:true})).not.toContain('甲方调查结果');
 expect(reportText({...snapshot,selected:'b'})).not.toContain('甲方调查结果');
});
it('cancels pending analysis without accepting a late response',async()=>{
 let finish!:(v:Analysis)=>void;vi.mocked(consumerApi.analyse).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));await search();fireEvent.click(screen.getByRole('radio',{name:'甲方服务有限公司'}));fireEvent.click(screen.getByRole('button',{name:'确认主体并生成风险评估'}));fireEvent.click(screen.getByRole('button',{name:'取消'}));await act(async()=>finish(report));await waitFor(()=>expect(screen.queryByRole('region',{name:'证据时间线'})).toBeNull());
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

it('opens an Intro bookmark at the magnifier and still allows deliberate Intro navigation',async()=>{
 window.history.replaceState({},'','/#intro');const view=render(<App/>);
 const target=document.getElementById('intro')!;
 const scroll=vi.fn();Object.defineProperty(target,'scrollIntoView',{value:scroll});
 await waitFor(()=>expect(window.scrollTo).toHaveBeenCalledWith({top:0,behavior:'instant'}));
 expect(window.location.hash).toBe('');
 expect(scroll).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('link',{name:'Intro'}));
 await waitFor(()=>expect(scroll).toHaveBeenCalledTimes(1));
 expect(scroll).toHaveBeenCalledWith({block:'start'});
 view.rerender(<App/>);
 expect(scroll).toHaveBeenCalledTimes(1);
 expect(screen.queryByLabelText('门店、品牌或公司名称')).toBeNull();
});

it('explains sources without exposing connection setup and preserves the query draft',()=>{
 render(<App/>);
 fireEvent.change(screen.getByLabelText('门店、品牌或公司名称'),{target:{value:'草稿门店'}});
 fireEvent.click(screen.getByText('资料来源说明'));
 const explanation=screen.getByText('资料来源说明').closest('details')!;
 expect(explanation.open).toBe(true);
 expect(explanation.textContent).toContain('公开网页与可用的企业资料');
 expect(explanation.querySelector('button, input, a')).toBeNull();
 expect(explanation.textContent).not.toMatch(/WorkBuddy|OAuth|Client|配置|模型|连接状态/);
 expect(consumerApi.capabilities).not.toHaveBeenCalled();
 expect((screen.getByLabelText('门店、品牌或公司名称') as HTMLInputElement).value).toBe('草稿门店');
 expect(consumerApi.discover).not.toHaveBeenCalled();
});

it.each(['/', '/#intro', '/#investigate', '/index.html', '/index.html#intro', '/index.html#investigate'])('opens %s on the homepage even with an existing query draft',async(entry)=>{
 sessionStorage.setItem(verificationStorageKey,JSON.stringify({...emptyVerification,query:'保留的门店草稿'}));
 window.history.replaceState({},'',entry);render(<App/>);
 expect(window.location.pathname).toBe('/');
 expect(window.location.hash).toBe('');
 expect(document.querySelector('.jw-hero')).toBeTruthy();
 expect(document.getElementById('intro')).toBeTruthy();
 expect(document.getElementById('jw-agent-title')).toBeNull();
 expect(screen.queryByLabelText('门店、品牌或公司名称')).toBeNull();
 expect(consumerApi.discover).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('link',{name:'search'}));
 expect(window.location.pathname).toBe('/investigations/new');
 expect((screen.getByLabelText('门店、品牌或公司名称') as HTMLInputElement).value).toBe('保留的门店草稿');
 fireEvent.click(screen.getByRole('link',{name:'← 返回首页'}));
 expect(window.location.pathname).toBe('/');
 expect(document.querySelector('.jw-hero')).toBeTruthy();
 expect(document.getElementById('jw-agent-title')).toBeNull();
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
 expect(screen.queryByText(/用户确认依据：/)).toBeNull();
 expect(consumerApi.discover).toHaveBeenCalledTimes(1);
});

it('preserves a written confirmation basis from a historical saved report',()=>{
 sessionStorage.setItem(verificationStorageKey,JSON.stringify({...emptyVerification,query:'历史门店',discovery,selected:'a',confirmation:'营业执照名称一致',report}));
 window.history.replaceState({},'','/investigations/inv/evidence');render(<App/>);
 expect(screen.getByText('用户确认依据：营业执照名称一致')).toBeTruthy();
 expect(screen.getByText('甲方调查结果')).toBeTruthy();
 expect(consumerApi.discover).not.toHaveBeenCalled();expect(consumerApi.analyse).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'← 返回主体核对'}));
 expect(screen.queryByLabelText('你核对主体的依据')).toBeNull();
 expect((screen.getByRole('button',{name:'确认主体并生成风险评估'}) as HTMLButtonElement).disabled).toBe(false);
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

