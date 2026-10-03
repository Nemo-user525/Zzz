import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { XiaoXEnterpriseAgent } from '../src/XiaoXEnterpriseAgent';

const COMPANY = '测试企业有限公司';
const connection = {
  provider: 'workbuddy', configured: true, configurable: true, app_configured: true,
  status: 'authorized', message: 'WorkBuddy 应用已授权。', active_registry_provider: 'qcc_mcp',
};
const result = {
  provider: 'workbuddy', company_name: COMPANY, matched_company_name: COMPANY,
  status: 'completed', message: '已取得本次企查查工具回传。', step: { status: 'completed' },
  sources: [{ id: 'one', title: `${COMPANY} · 工商登记`, publisher: '企查查 MCP（WorkBuddy 回传）',
    excerpt: '注册资本：100万元', page_status: '未独立在线复验', url: 'https://agent.qcc.com/guide' }],
};
const response = (value: unknown, ok = true) => Promise.resolve({ ok, json: async () => value } as Response);
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('reports unconfigured WorkBuddy independently from the working MCP provider', async () => {
  fetchMock.mockImplementation(() => response({ ...connection, configured: false, app_configured: false,
    status: 'not_configured', message: '请先配置 WorkBuddy 开放平台应用。' }));
  render(<XiaoXEnterpriseAgent companyName={COMPANY} onClose={vi.fn()}/>);
  expect(await screen.findByText('请先配置 WorkBuddy 开放平台应用。')).toBeTruthy();
  expect(screen.getByText(/当前查证使用企查查 MCP/)).toBeTruthy();
  expect((screen.getByRole('button', { name: '查询企业资料' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '查询企业资料' }));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: '配置 WorkBuddy' })).toBeTruthy();
});

it('requires a confirmed company and never auto-submits when opened', async () => {
  fetchMock.mockImplementation(() => response(connection));
  render(<XiaoXEnterpriseAgent onClose={vi.fn()}/>);
  const link = await screen.findByRole('link', { name: '去确认企业 ↗' });
  expect(link.getAttribute('href')).toBe('/investigations/new');
  expect((screen.getByRole('button', { name: '查询企业资料' }) as HTMLButtonElement).disabled).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('queries only the WorkBuddy endpoint and displays its original source fields', async () => {
  fetchMock.mockImplementation((path) => response(String(path).endsWith('/status') ? connection : result));
  render(<XiaoXEnterpriseAgent companyName={COMPANY} onClose={vi.fn()}/>);
  const button = await screen.findByRole('button', { name: '查询企业资料' });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  fireEvent.click(button);
  expect(await screen.findByText(result.message)).toBeTruthy();
  expect(screen.getByText('注册资本：100万元')).toBeTruthy();
  expect(screen.getByText('企查查 MCP（WorkBuddy 回传）')).toBeTruthy();
  expect(fetchMock.mock.calls[1][0]).toBe('/api/consumer/enterprise-agent/query');
  expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual({ company_name: COMPANY, identity_confirmed: true });
  expect(screen.getByRole('link', { name: '查看来源说明 ↗' }).getAttribute('href')).toBe('https://agent.qcc.com/guide');
});

it('aborts a query and ignores a late response when the confirmed company changes', async () => {
  let finish!: (value: Response) => void;
  fetchMock.mockImplementation(path => String(path).endsWith('/status') ? response(connection)
    : new Promise<Response>(resolve => { finish = resolve; }));
  const view = render(<XiaoXEnterpriseAgent companyName={COMPANY} onClose={vi.fn()}/>);
  fireEvent.click(await screen.findByRole('button', { name: '查询企业资料' }));
  const signal = fetchMock.mock.calls[1][1]?.signal;
  view.rerender(<XiaoXEnterpriseAgent companyName="另一家有限公司" onClose={vi.fn()}/>);
  expect(signal?.aborted).toBe(true);
  await act(async () => finish(await response(result)));
  expect(screen.queryByText('注册资本：100万元')).toBeNull();
  expect(screen.getByText('另一家有限公司')).toBeTruthy();
  expect((screen.getByRole('button', { name: '查询企业资料' }) as HTMLButtonElement).disabled).toBe(false);
});

it('allows retrying a status failure and aborts status reads on unmount', async () => {
  fetchMock.mockRejectedValueOnce(new Error('network unavailable')).mockImplementation(() => response(connection));
  const view = render(<XiaoXEnterpriseAgent companyName={COMPANY} onClose={vi.fn()}/>);
  fireEvent.click(await screen.findByRole('button', { name: '重试连接状态' }));
  await screen.findByRole('button', { name: '查询企业资料' });
  const signal = fetchMock.mock.calls[1][1]?.signal;
  view.unmount();
  expect(signal?.aborted).toBe(true);
});

it('shows a genuine connector error without inventing company information', async () => {
  fetchMock.mockImplementation(path => response(String(path).endsWith('/status') ? connection
    : { ...result, status: 'offline', message: 'WorkBuddy 本地助理未在线。', sources: [], matched_company_name: null }));
  render(<XiaoXEnterpriseAgent companyName={COMPANY} onClose={vi.fn()}/>);
  fireEvent.click(await screen.findByRole('button', { name: '查询企业资料' }));
  expect(await screen.findByText('WorkBuddy 本地助理未在线。')).toBeTruthy();
  expect(screen.queryByText('注册资本：100万元')).toBeNull();
  await waitFor(() => expect((screen.getByRole('button', { name: '查询企业资料' }) as HTMLButtonElement).disabled).toBe(false));
});

it('reports real query activity to the dog and clears it when waiting stops', async () => {
  const onBusyChange = vi.fn();
  fetchMock.mockImplementation(path => String(path).endsWith('/status') ? response(connection)
    : new Promise<Response>(() => {}));
  render(<XiaoXEnterpriseAgent companyName={COMPANY} onClose={vi.fn()} onBusyChange={onBusyChange}/>);
  fireEvent.click(await screen.findByRole('button', { name: '查询企业资料' }));
  expect(onBusyChange).toHaveBeenLastCalledWith(true);
  const signal = fetchMock.mock.calls[1][1]?.signal;
  fireEvent.click(screen.getByRole('button', { name: '停止等待' }));
  expect(signal?.aborted).toBe(true);
  expect(onBusyChange).toHaveBeenLastCalledWith(false);
  expect(screen.getByText(/WorkBuddy 已收到的任务可能仍在执行/)).toBeTruthy();
});
