import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PublicFinancials } from '../src/PublicFinancials';
import * as source from '../src/api/publicFinancials';

afterEach(() => {cleanup();vi.restoreAllMocks();});
const fixture: source.PublicFinancials = {
  provider:'东方财富',status:'partial',security_code:'000333.SZ',retrieved_at:'2026-10-02T00:00:00Z',cached:false,
  source_url:'https://emweb.eastmoney.com/', limitations:['不得当作自由现金'],
  groups:[{id:'balance',title:'资产负债表',status:'success',message:'',records:[{
    company_name:'测试企业',report_date:'2026-06-30',report_name:'2026中报',published_at:'2026-08-29',updated_at:null,currency:'CNY',
    metrics:[{id:'cash',label:'货币资金',value:0,unit:'amount'},{id:'debt',label:'资产负债率',value:40,unit:'percent'},{id:'missing',label:'应收账款',value:null,unit:'amount'}],
  }]},{id:'income',title:'利润表',status:'failed',message:'来源访问失败',records:[]}],
};

it('fetches only after selecting a securities code and preserves missing versus zero', async () => {
  const request=vi.spyOn(source,'loadPublicFinancials').mockResolvedValue(fixture);
  render(<PublicFinancials candidates={[{name:'测试企业',ticker:'000333'},{name:'同一企业',ticker:'000333'}]}/>);
  expect(request).not.toHaveBeenCalled();
  expect(screen.getAllByRole('button')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button',{name:'查看 测试企业（000333）的公开财报'}));
  await screen.findByRole('heading',{name:'测试企业 · 公开财报'});
  expect(request).toHaveBeenCalledWith('000333.SZ',expect.anything());
  expect(screen.getByText('0 元')).toBeTruthy();
  expect(screen.getByText('40%')).toBeTruthy();
  expect(screen.getByText('未提供')).toBeTruthy();
  expect(screen.getByText('部分报表未能取得，已返回的报表仍可查看。')).toBeTruthy();
});

it('nonlisted query has no automatic financial match or lookup', () => {
  const request=vi.spyOn(source,'loadPublicFinancials');
  render(<PublicFinancials candidates={[{name:'非上市企业',ticker:''}]}/>);
  expect(screen.queryByRole('button')).toBeNull();
  expect(request).not.toHaveBeenCalled();
});

it('switching candidates hides old financials and ignores slow old responses', async () => {
  let old!: (v:source.PublicFinancials) => void;
  vi.spyOn(source,'loadPublicFinancials').mockImplementation(code => code === '000333.SZ' ? new Promise(r => {old=r;}) : Promise.resolve({...fixture,security_code:'600519.SH',groups:[]}));
  render(<PublicFinancials candidates={[{name:'企业一',ticker:'000333'},{name:'企业二',ticker:'600519'}]}/>);
  fireEvent.click(screen.getByRole('button',{name:'查看 企业一（000333）的公开财报'}));
  fireEvent.click(screen.getByRole('button',{name:'查看 企业二（600519）的公开财报'}));
  await screen.findByRole('heading',{name:'600519.SH · 公开财报'});
  await act(async () => old(fixture));
  expect(screen.queryByRole('heading',{name:'测试企业 · 公开财报'})).toBeNull();
});

it('connection failure permits retry without clearing company candidates', async () => {
  vi.spyOn(source,'loadPublicFinancials').mockRejectedValue(new Error('公开财报暂时无法访问'));
  render(<PublicFinancials candidates={[{name:'测试企业',ticker:'000333'}]}/>);
  fireEvent.click(screen.getByRole('button',{name:'查看 测试企业（000333）的公开财报'}));
  await screen.findByRole('alert');
  await waitFor(() => expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false));
});
