import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ConsumerWorkspace } from '../src/ConsumerWorkspace';
import { consumerApi, type Discovery } from '../src/api/consumer';
import type { VoiceFields } from '../src/useXiaoXVoice';

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
  vi.clearAllMocks();
  voice.receiveTranscript = () => {};
  sessionStorage.clear();
  window.history.replaceState({}, '', '/#investigate');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.spyOn(consumerApi, 'capabilities').mockRejectedValue(new Error('not configured'));
  vi.spyOn(consumerApi, 'discover').mockResolvedValue(structuredClone(discovery));
  vi.spyOn(consumerApi, 'analyse');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('redirects the legacy anchor and submits the separate agent form into identity review', async () => {
  render(<ConsumerWorkspace />);
  expect(window.location.pathname + window.location.hash).toBe('/investigations/new');
  expect(screen.getAllByTestId('xiaox-character')).toHaveLength(1);
  expect(screen.getAllByRole('button', { name: '点击小 X，开始语音识别' })).toHaveLength(1);
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

it('automatically fills extracted name and explicit location without submitting the investigation', async () => {
  render(<ConsumerWorkspace />);
  expect(screen.getAllByTestId('xiaox-character')).toHaveLength(1);
  fireEvent.change(screen.getByLabelText(/城市／门店位置/), { target: { value: '上海' } });
  fireEvent.click(screen.getByRole('button', { name: '点击小 X，开始语音识别' }));
  expect(voice.start).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('heading', { name: '说给小 X 听' })).toBeTruthy();
  act(() => voice.receiveTranscript('帮我查一下杭州西湖区的语音门店', { query: '语音门店', location: '杭州 西湖区', needs_clarification: false }));
  const query = screen.getByLabelText('门店、品牌或公司名称') as HTMLInputElement;
  expect(query.value).toBe('语音门店');
  expect((screen.getByLabelText(/城市／门店位置/) as HTMLInputElement).value).toBe('杭州 西湖区');
  expect(consumerApi.discover).not.toHaveBeenCalled();
  expect(consumerApi.analyse).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: '确认填入' })).toBeNull();
  expect(screen.queryByRole('button', { name: '填入查询栏' })).toBeNull();
  expect(screen.getAllByTestId('xiaox-character')).toHaveLength(1);

  fireEvent.submit(query.closest('form')!);
  await screen.findByRole('radio', { name: '测试门店运营公司' });
  expect(consumerApi.discover).toHaveBeenCalledWith('语音门店', '杭州 西湖区', expect.any(AbortSignal));
});

it('preserves the existing city when speech contains only a company name', () => {
  render(<ConsumerWorkspace />);
  fireEvent.change(screen.getByLabelText(/城市／门店位置/), { target: { value: '上海 静安区' } });
  fireEvent.click(screen.getByRole('button', { name: '点击小 X，开始语音识别' }));
  act(() => voice.receiveTranscript('我要查测试公司', { query: '测试公司', location: '', needs_clarification: false }));
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
  fireEvent.click(screen.getByRole('button', { name: '点击小 X，开始语音识别' }));
  act(() => voice.receiveTranscript('谢谢你，今天辛苦了', fields));
  expect((screen.getByLabelText('门店、品牌或公司名称') as HTMLInputElement).value).toBe('原来的公司');
  expect((screen.getByLabelText(/城市／门店位置/) as HTMLInputElement).value).toBe('上海');
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
