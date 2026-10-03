import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CompanySearch } from '../src/CompanySearch';
import { qccApi, type QccResult } from '../src/api/qcc';
import * as wire from '../src/api/history';

const company = {id:'test',name:'测试企业',ticker:'688086',industry:'测试'};
const discovery: wire.Discovery = {status:'success',query:'测试企业',companies:[],announcements:[{announcement_id:'a',title:'测试公告',url:'https://example.com/a',published_at:'2026-01-01',short_name:'测试企业'}],external_search_links:[],limitations:[]};
const fixture: QccResult = {provider:'企查查',api_code:'736',query:'测试企业',retrieved_at:'2026-10-02T00:00:00Z',company:{name:'测试企业',credit_code:'TEST',registration_status:'存续',legal_representative:null,registered_capital:null,established_at:null,updated_at:null,address:null},groups:[{id:'Penalty',title:'行政处罚',available:false,returned_count:null,records:[]}],limitations:['不属于历史时点证据']};
const enter = () => fireEvent.change(screen.getByLabelText('企业关键词、名称片段、证券代码或信用代码'),{target:{value:'测试企业'}});
beforeEach(() => {
  vi.spyOn(qccApi,'status').mockResolvedValue({configured:false,provider:'企查查',api_code:'736'});
  vi.spyOn(wire,'historyRequest').mockImplementation(async path => (path.startsWith('/companies?') ? {items:[company]} : discovery) as never);
});
afterEach(() => {cleanup();vi.restoreAllMocks();});

it('searches local and public sources without QCC keys; typing makes no lookup', async () => {
  const lookup=vi.spyOn(qccApi,'lookup'); const onSelect=vi.fn();
  render(<CompanySearch companies={[company]} onSelect={onSelect} onSearch={vi.fn()}/>);
  await act(async () => {}); enter();
  expect((screen.getByRole('button',{name:'查询企业'}) as HTMLButtonElement).disabled).toBe(false);
  expect(wire.historyRequest).not.toHaveBeenCalled(); expect(lookup).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'查询企业'}));
  await screen.findByRole('link',{name:'测试公告 ↗'});
  fireEvent.click(screen.getByRole('button',{name:'查看历史资料'}));
  expect(onSelect).toHaveBeenCalledWith(company);
  expect(wire.historyRequest).toHaveBeenCalledWith('/companies?query=' + encodeURIComponent('测试企业') + '&page_size=100',expect.anything());
  expect(wire.historyRequest).toHaveBeenCalledWith('/discovery?query=' + encodeURIComponent('测试企业'),expect.anything());
  expect(lookup).not.toHaveBeenCalled();
});

it('permits local selection while public discovery is slow and after it fails', async () => {
  let rejectPublic!: (e: Error) => void;
  vi.mocked(wire.historyRequest).mockImplementation(async path => path.startsWith('/companies?') ? {items:[company]} as never : new Promise((_,reject) => {rejectPublic=reject;}) as never);
  const onSelect=vi.fn();
  render(<CompanySearch companies={[company]} onSelect={onSelect} onSearch={vi.fn()}/>);
  enter(); fireEvent.click(screen.getByRole('button',{name:'查询企业'}));
  fireEvent.click(screen.getByRole('button',{name:'查看历史资料'}));
  expect(onSelect).toHaveBeenCalledWith(company);
  await act(async () => rejectPublic(new Error('timeout')));
  await screen.findByText('公开公告查询失败或超时，请稍后重试，或前往官方公示系统核验。');
  expect((screen.getByRole('button',{name:'查询企业'}) as HTMLButtonElement).disabled).toBe(false);
});

it('shows risk details after identity confirmation and clears them on editing', async () => {
  vi.mocked(qccApi.status).mockResolvedValue({configured:true,provider:'企查查',api_code:'736'});
  const lookup=vi.spyOn(qccApi,'lookup').mockResolvedValue(fixture);
  render(<CompanySearch companies={[]} onSelect={vi.fn()} onSearch={vi.fn()}/>);
  await act(async () => {}); enter(); expect(lookup).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'查询企业'}));
  await screen.findByRole('heading',{name:'测试企业'});
  expect(screen.queryByText('行政处罚')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'确认这家企业，查看资料 →'}));
  await screen.findByText('行政处罚'); await screen.findByText('接口未提供');
  fireEvent.change(screen.getByLabelText('企业关键词、名称片段、证券代码或信用代码'),{target:{value:'另一企业'}});
  expect(screen.queryByRole('heading',{name:'测试企业'})).toBeNull();
  expect(screen.queryByText('行政处罚')).toBeNull();
});

it('ignores all old query responses after input changes', async () => {
  vi.mocked(qccApi.status).mockResolvedValue({configured:true,provider:'企查查',api_code:'736'});
  let resolve!: (v: QccResult) => void;
  let resolveDiscovery!: (v: wire.Discovery) => void;
  vi.spyOn(qccApi,'lookup').mockImplementation(() => new Promise(r => {resolve=r;}));
  vi.mocked(wire.historyRequest).mockImplementation(async path => path.startsWith('/companies?') ? {items:[company]} as never : new Promise(r => {resolveDiscovery=r;}) as never);
  render(<CompanySearch companies={[]} onSelect={vi.fn()} onSearch={vi.fn()}/>);
  await act(async () => {}); enter(); fireEvent.click(screen.getByRole('button',{name:'查询企业'}));
  fireEvent.change(screen.getByLabelText('企业关键词、名称片段、证券代码或信用代码'),{target:{value:'另一企业'}});
  await act(async () => {resolve(fixture);resolveDiscovery(discovery);});
  expect(screen.queryByRole('heading',{name:'测试企业'})).toBeNull();
  expect(screen.queryByText('测试公告')).toBeNull();
});

it('QCC failure leaves local matches available and enables retry', async () => {
  vi.mocked(qccApi.status).mockResolvedValue({configured:true,provider:'企查查',api_code:'736'});
  vi.spyOn(qccApi,'lookup').mockRejectedValue(new Error('请检查接口权限与剩余额度'));
  render(<CompanySearch companies={[company]} onSelect={vi.fn()} onSearch={vi.fn()}/>);
  await act(async () => {}); enter(); fireEvent.click(screen.getByRole('button',{name:'查询企业'}));
  await screen.findByText('请检查接口权限与剩余额度');
  await waitFor(() => expect((screen.getByRole('button',{name:'查询企业'}) as HTMLButtonElement).disabled).toBe(false));
  expect((screen.getByRole('button',{name:'查看历史资料'}) as HTMLButtonElement).disabled).toBe(false);
});
