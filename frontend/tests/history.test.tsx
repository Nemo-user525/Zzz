import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { HistoryWorkspace } from '../src/HistoryWorkspace';
import * as wire from '../src/api/history';

afterEach(() => {cleanup();vi.restoreAllMocks();});
const snap = (id: string, day: string): wire.Snapshot => ({company:{id,name:'企业'+id,ticker:id,industry:'测试'},as_of:day,dataset_version:'test',facts:[],timeline:[],documents:[],coverage:{visible_document_count:0,supported_assertion_count:0,latest_visible_publication:null},limitations:[]});
const quality = {entities:2,documents:0,supported_documents:0,parsed_documents:0,assertion_statuses:{},events:0,outcome_statuses:{},human_reviewed:0,dataset_version:'test',last_fetched_at:null,last_reviewed_at:null,limitations:[]};

it('ignores slow older company and date responses and hides later outcomes immediately', async () => {
  let completeOld!: (v: unknown) => void;
  const mock=vi.spyOn(wire,'historyRequest').mockImplementation(async (path) => {
    if(path==='/companies?page_size=100') return {items:[{id:'a',name:'企业a',ticker:'a',industry:'test'},{id:'b',name:'企业b',ticker:'b',industry:'test'}]} as never;
    if(path==='/dataset/quality') return quality as never;
    if(path.includes('/a/snapshot')) return new Promise(resolve => {completeOld=resolve;}) as never;
    if(path.includes('/b/snapshot')) return snap('b', path.split('as_of=')[1]) as never;
    if(path.includes('/outcomes')) return {as_of:'2023-04-23',window_end:'2023-10-20',observation_status:'observed_positive',outcomes:[{id:'future',stage:'后续结果专用标记',confirmed_at:'2023-06-01',occurred_at:null,document_id:'d',page:1,excerpt:'后来的信息',affected_entity:'企业b'}],limitations:[]} as never;
    throw Error(path);
  });
  render(<HistoryWorkspace onSimulate={vi.fn()}/>);
  await waitFor(() => expect(mock).toHaveBeenCalledWith(expect.stringContaining('/a/snapshot'), expect.anything()));
  fireEvent.change(screen.getByLabelText('历史企业'),{target:{value:'b'}});
  await screen.findByRole('heading',{name:'企业b'});
  await act(async () => completeOld(snap('a','2023-04-23')));
  expect(screen.queryByRole('heading',{name:'企业a'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'展开后续结果'}));
  await screen.findByText('后续结果专用标记');
  fireEvent.change(screen.getByLabelText('历史日期'),{target:{value:'2023-01-01'}});
  expect(screen.queryByText('后续结果专用标记')).toBeNull();
  await screen.findByText('2023-01-01 零时前可用 · b');
});

it('network failure is explicit and never becomes a supported fact', async () => {
  vi.spyOn(wire,'historyRequest').mockImplementation(async path => {
    if(path==='/companies?page_size=100') return {items:[]} as never;
    if(path==='/dataset/quality') return quality as never;
    return {status:'failed',query:'未覆盖企业',companies:[],announcements:[],external_search_links:[],limitations:['连接失败，不等于无风险']} as never;
  });
  render(<HistoryWorkspace onSimulate={vi.fn()}/>);
  fireEvent.change(screen.getByLabelText('输入任意企业名称或证券代码'),{target:{value:'未覆盖企业'}});
  fireEvent.click(screen.getByRole('button',{name:'联网查找资料'}));
  await screen.findByRole('heading',{name:'联网查询失败'});
  expect(screen.queryByText('原文支持 · agent 核对')).toBeNull();
});
