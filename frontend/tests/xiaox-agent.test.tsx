import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ConsumerWorkspace } from '../src/ConsumerWorkspace';
import { consumerApi, type Discovery } from '../src/api/consumer';
import type { VoiceFields } from '../src/useXiaoXVoice';
import { verificationStorageKey } from '../src/jianweiVerification';

const voice = vi.hoisted(() => ({
  supported: true,
  listening: false,
  processing: false,
  level: 0,
  interim: '',
  message: '',
  start: vi.fn(),
  stop: vi.fn(),
  cancel: vi.fn(),
  receiveTranscript: (_text: string, _fields?: VoiceFields) => {},
}));

vi.mock('../src/useXiaoXVoice', () => ({
  useXiaoXVoice: (onTranscript: (text: string, fields?: VoiceFields) => void) => {
    voice.receiveTranscript = onTranscript;
    return voice;
  },
}));

vi.mock('../src/XiaoXEnterpriseAgent', () => ({
  XiaoXEnterpriseAgent: () => <section data-testid="enterprise-agent" />,
}));

vi.mock('../src/XiaoXMotion', () => ({
  XiaoXMotion: ({ activity }: { activity: string }) => (
    <span data-testid="xiaox-character" data-activity={activity} aria-hidden="true" />
  ),
}));

const discovery: Discovery = {
  investigation_id: 'xiaox-test', query: '测试门店', location: '杭州 西湖区',
  generated_at: '2026-10-03T00:00:00Z', mode: 'live_search',
  candidates: [{ id: 'shop', name: '测试门店运营公司', basis: '公开材料提及', source_ids: [], relationship_status: '门店关系待核对' }],
  sources: [], trace: [], unknowns: [],
};

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)', media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() })));
  vi.clearAllMocks();
  voice.receiveTranscript = () => {};
  sessionStorage.clear();
  window.history.replaceState({}, '', '/investigations/new');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.spyOn(consumerApi, 'capabilities').mockRejectedValue(new Error('not configured'));
  vi.spyOn(consumerApi, 'discover').mockResolvedValue(structuredClone(discovery));
  vi.spyOn(consumerApi, 'analyse');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('submits the dedicated agent page into identity review', async () => {
  render(<ConsumerWorkspace />);
  expect(window.location.pathname + window.location.hash).toBe('/investigations/new');
  expect(screen.queryByRole('button', { name: '打开小 X 语音查案提示' })).toBeNull();
  const name = screen.getByLabelText('门店、品牌或公司名称');
  const form = name.closest('form')!;
  expect(document.getElementById('investigate')?.contains(form)).toBe(true);
  expect(screen.getByRole('button', { name: '查找经营主体' }).getAttribute('disabled')).not.toBeNull();
  fireEvent.change(name, { target: { value: ' 测试门店 ' } });
  fireEvent.change(screen.getByLabelText(/城市／门店位置/), { target: { value: ' 杭州 西湖区 ' } });
  expect(consumerApi.discover).not.toHaveBeenCalled();
  fireEvent.submit(form);
  const candidate = await screen.findByRole('radio', { name: '测试门店运营公司' });
  expect(consumerApi.discover).toHaveBeenCalledWith('测试门店', '杭州 西湖区', expect.any(AbortSignal));
  expect(window.location.pathname).toBe('/investigations/xiaox-test/identity');
  expect((candidate as HTMLInputElement).checked).toBe(false);
  expect(consumerApi.analyse).not.toHaveBeenCalled();
  expect(screen.getAllByTestId('xiaox-character')).toHaveLength(1);
  expect(screen.getByRole('complementary', { name: '小 X 常驻助手' })).toBeTruthy();
});

it('keeps the query-page video decorative without voice or drag controls', () => {
  render(<ConsumerWorkspace />);
  const decoration = screen.getByTestId('xiaox-character');
  expect(decoration).toBeTruthy();
  expect(decoration.getAttribute('data-activity')).toBe('idle');
  expect(decoration.closest('.jw-agent-decoration')).not.toBeNull();
  expect(decoration.closest('button')).toBeNull();
  fireEvent.click(decoration);
  fireEvent.pointerDown(decoration, { pointerId: 1, clientX: 100, clientY: 300 });
  fireEvent.pointerMove(decoration, { pointerId: 1, clientX: 200, clientY: 400 });
  fireEvent.pointerUp(decoration, { pointerId: 1, clientX: 200, clientY: 400 });
  expect(voice.start).not.toHaveBeenCalled();
  expect(screen.queryByRole('heading', { name: '说给小 X 听' })).toBeNull();
  expect(screen.queryByRole('complementary', { name: '小 X 常驻助手' })).toBeNull();
  expect(screen.queryByRole('button', { name: '让小 X 跳舞' })).toBeNull();
  expect(screen.queryByText(/直接说给我听/)).toBeNull();
  expect(sessionStorage.getItem('xiaox-companion-position-v2')).toBeNull();
  expect(consumerApi.discover).not.toHaveBeenCalled();
  expect(consumerApi.analyse).not.toHaveBeenCalled();
});

it('uses the actual agent phase for the inline dog during a search and a failed query', async () => {
  let failSearch!: (reason: Error) => void;
  vi.mocked(consumerApi.discover).mockImplementationOnce(() => new Promise((_resolve, reject) => { failSearch = reject; }));
  render(<ConsumerWorkspace />);
  fireEvent.change(screen.getByLabelText('门店、品牌或公司名称'), { target: { value: '测试门店' } });
  fireEvent.submit(screen.getByLabelText('门店、品牌或公司名称').closest('form')!);
  expect(screen.getByTestId('xiaox-character').getAttribute('data-activity')).toBe('searching');
  await act(async () => failSearch(new Error('查询暂时不可用')));
  expect(screen.getByTestId('xiaox-character').getAttribute('data-activity')).toBe('attention');
  expect(screen.getAllByTestId('xiaox-character')).toHaveLength(1);
});

it('keeps voice results visible on the homepage until the user opens the filled query', async () => {
  window.history.replaceState({}, '', '/');
  render(<ConsumerWorkspace />);
  fireEvent.click(screen.getByRole('button', { name: '打开小 X 语音查案提示' }));
  expect(voice.start).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '开始录音' }));
  expect(voice.start).toHaveBeenCalledTimes(1);
  act(() => voice.receiveTranscript('查一下测试公司', { query: '测试公司', location: '杭州', needs_clarification: false }));
  expect(window.location.pathname).toBe('/');
  expect(screen.getByRole('heading', { name: '说给小 X 听' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '填入查询栏' }));
  expect(window.location.pathname).toBe('/investigations/new');
  expect(screen.queryByRole('heading', { name: '说给小 X 听' })).toBeNull();
  const query = screen.getByLabelText('门店、品牌或公司名称') as HTMLInputElement;
  expect(query.value).toBe('测试公司');
  expect((screen.getByLabelText(/城市／门店位置/) as HTMLInputElement).value).toBe('杭州');
  await waitFor(() => expect(document.activeElement).toBe(query));
  expect(consumerApi.discover).not.toHaveBeenCalled();
});

it('does not replace an open investigation until the voice draft is explicitly applied', async () => {
  render(<ConsumerWorkspace />);
  fireEvent.change(screen.getByLabelText('门店、品牌或公司名称'), { target: { value: '原来的门店' } });
  fireEvent.submit(screen.getByLabelText('门店、品牌或公司名称').closest('form')!);
  await screen.findByRole('radio', { name: '测试门店运营公司' });
  fireEvent.click(screen.getByRole('button', { name: '打开小 X 语音查案提示' }));
  expect(voice.start).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '开始录音' }));
  expect(voice.start).toHaveBeenCalledTimes(1);
  act(() => voice.receiveTranscript('查一下另一家门店', { query: '另一家门店', location: '', needs_clarification: false }));
  expect(window.location.pathname).toBe('/investigations/xiaox-test/identity');
  expect(screen.getByRole('radio', { name: '测试门店运营公司' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '填入查询栏' }));
  expect(window.location.pathname).toBe('/investigations/new');
  const query = screen.getByLabelText('门店、品牌或公司名称') as HTMLInputElement;
  expect(query.value).toBe('另一家门店');
  await waitFor(() => expect(document.activeElement).toBe(query));
  expect(screen.getByRole('button', { name: '返回上次查证' })).toBeTruthy();
  expect(consumerApi.discover).toHaveBeenCalledTimes(1);
});

it('preserves the existing city when homepage speech contains only a company name', async () => {
  render(<ConsumerWorkspace />);
  fireEvent.change(screen.getByLabelText(/城市／门店位置/), { target: { value: '上海 静安区' } });
  fireEvent.click(screen.getByRole('link', { name: '← 返回首页' }));
  fireEvent.click(screen.getByRole('button', { name: '打开小 X 语音查案提示' }));
  expect(voice.start).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '开始录音' }));
  expect(voice.start).toHaveBeenCalledTimes(1);
  act(() => voice.receiveTranscript('我要查测试公司', { query: '测试公司', location: '', needs_clarification: false }));
  fireEvent.click(screen.getByRole('button', { name: '填入查询栏' }));
  await waitFor(() => expect(window.location.pathname).toBe('/investigations/new'));
  expect((screen.getByLabelText('门店、品牌或公司名称') as HTMLInputElement).value).toBe('测试公司');
  expect((screen.getByLabelText(/城市／门店位置/) as HTMLInputElement).value).toBe('上海 静安区');
  expect(consumerApi.discover).not.toHaveBeenCalled();
  expect(consumerApi.analyse).not.toHaveBeenCalled();
});

it.each([
  undefined,
  { query: '', location: '', needs_clarification: true },
  { query: '', location: '杭州', needs_clarification: false },
  { query: '今天辛苦了', location: '', needs_clarification: true },
])('keeps existing query and city when speech has no reliable company keyword', fields => {
  render(<ConsumerWorkspace />);
  fireEvent.change(screen.getByLabelText('门店、品牌或公司名称'), { target: { value: '原来的公司' } });
  fireEvent.change(screen.getByLabelText(/城市／门店位置/), { target: { value: '上海' } });
  fireEvent.click(screen.getByRole('link', { name: '← 返回首页' }));
  fireEvent.click(screen.getByRole('button', { name: '打开小 X 语音查案提示' }));
  expect(voice.start).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '开始录音' }));
  expect(voice.start).toHaveBeenCalledTimes(1);
  act(() => voice.receiveTranscript('谢谢你，今天辛苦了', fields));
  const saved = JSON.parse(sessionStorage.getItem(verificationStorageKey) || '{}');
  expect(saved.query).toBe('原来的公司');
  expect(saved.location).toBe('上海');
  expect((screen.getByLabelText('提取的门店或公司名称') as HTMLTextAreaElement).value).toBe('');
  expect(consumerApi.discover).not.toHaveBeenCalled();
  expect(consumerApi.analyse).not.toHaveBeenCalled();
});

it('cancels an agent search and ignores its late result while a replacement search is pending', async () => {
  let finishOld!: (value: Discovery) => void;
  let finishNew!: (value: Discovery) => void;
  vi.mocked(consumerApi.discover)
    .mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
    .mockImplementationOnce(() => new Promise(resolve => { finishNew = resolve; }));
  render(<ConsumerWorkspace />);
  fireEvent.change(screen.getByLabelText('门店、品牌或公司名称'), { target: { value: '旧门店' } });
  fireEvent.submit(screen.getByLabelText('门店、品牌或公司名称').closest('form')!);
  const firstSignal = vi.mocked(consumerApi.discover).mock.calls[0][2]!;
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(firstSignal.aborted).toBe(true);
  fireEvent.change(screen.getByLabelText('门店、品牌或公司名称'), { target: { value: '新门店' } });
  fireEvent.submit(screen.getByLabelText('门店、品牌或公司名称').closest('form')!);
  await act(async () => finishOld(discovery));
  expect(window.location.pathname + window.location.hash).toBe('/investigations/new');
  expect(screen.queryByRole('radio')).toBeNull();
  await act(async () => finishNew({ ...discovery, investigation_id: 'new-shop', query: '新门店' }));
  await screen.findByRole('radio', { name: '测试门店运营公司' });
  expect(window.location.pathname).toBe('/investigations/new-shop/identity');
  expect(consumerApi.analyse).not.toHaveBeenCalled();
});
