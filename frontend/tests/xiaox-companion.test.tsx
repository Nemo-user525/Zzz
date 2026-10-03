import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { XiaoXCompanion } from '../src/XiaoXCompanion';
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
    <span data-testid="companion-motion" data-activity={activity} aria-hidden="true" />
  ),
}));

function props() {
  return {
    activity: 'idle' as const,
    routeKey: '/investigations/new',
    busy: false,
    dancing: false,
    onDance: vi.fn(),
    onVoiceQuery: vi.fn((_fields: VoiceFields) => true),
  };
}

function openVoice() {
  fireEvent.click(screen.getByRole('button', { name: '点击小 X，开始语音识别' }));
  expect(screen.getByRole('heading', { name: '说给小 X 听' })).toBeTruthy();
}

beforeEach(() => {
  vi.clearAllMocks();
  voice.supported = true;
  voice.listening = false;
  voice.processing = false;
  voice.level = 0;
  voice.interim = '';
  voice.message = '';
  voice.receiveTranscript = () => {};
});

afterEach(cleanup);

it('keeps the companion present as investigation activity and routes change', () => {
  const base = props();
  const { rerender } = render(<XiaoXCompanion {...base} activity="thinking" busy />);
  const companion = screen.getByRole('complementary', { name: '小 X 常驻助手' });
  expect(screen.getByTestId('companion-motion').getAttribute('data-activity')).toBe('thinking');

  rerender(<XiaoXCompanion {...base} activity="complete" routeKey="/investigations/example/report" />);
  expect(screen.getByRole('complementary', { name: '小 X 常驻助手' })).toBe(companion);
  expect(screen.getByTestId('companion-motion').getAttribute('data-activity')).toBe('complete');
});

it('requests and stops dancing independently of voice input or a query', () => {
  const base = props();
  const { rerender } = render(<XiaoXCompanion {...base} />);
  fireEvent.click(screen.getByRole('button', { name: '让小 X 跳舞' }));
  expect(base.onDance).toHaveBeenCalledTimes(1);
  expect(voice.start).not.toHaveBeenCalled();
  expect(base.onVoiceQuery).not.toHaveBeenCalled();

  rerender(<XiaoXCompanion {...base} dancing />);
  fireEvent.click(screen.getByRole('button', { name: '停止小 X 跳舞' }));
  expect(base.onDance).toHaveBeenCalledTimes(2);
  expect(base.onVoiceQuery).not.toHaveBeenCalled();
});

it('starts recording immediately when the user clicks the dog', () => {
  const base = props();
  render(<XiaoXCompanion {...base} />);
  expect(voice.start).not.toHaveBeenCalled();
  openVoice();
  expect(voice.start).toHaveBeenCalledTimes(1);
  expect(base.onVoiceQuery).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: '开始录音' })).toBeNull();
  expect(screen.queryByRole('button', { name: '语音输入门店名称' })).toBeNull();
});

it('uses the same dog to stop recording and prevents dancing while listening', () => {
  const base = props();
  const { rerender } = render(<XiaoXCompanion {...base} />);
  openVoice();
  voice.listening = true;
  voice.interim = '测试门店';
  rerender(<XiaoXCompanion {...base} />);
  expect(screen.getByTestId('companion-motion').getAttribute('data-activity')).toBe('listening');
  const dance = screen.getByRole('button', { name: '让小 X 跳舞' }) as HTMLButtonElement;
  expect(dance.disabled).toBe(true);
  fireEvent.click(dance);
  expect(base.onDance).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '点击小 X，结束录音' }));
  expect(voice.stop).toHaveBeenCalledTimes(1);
  expect(voice.start).toHaveBeenCalledTimes(1);
  expect(base.onVoiceQuery).not.toHaveBeenCalled();
});

it('prevents restarting recording or dancing while speech is being recognized', () => {
  const base = props();
  const { rerender } = render(<XiaoXCompanion {...base} />);
  openVoice();
  voice.processing = true;
  rerender(<XiaoXCompanion {...base} />);
  const dog = screen.getByRole('button', { name: '小 X 正在识别语音' }) as HTMLButtonElement;
  const dance = screen.getByRole('button', { name: '让小 X 跳舞' }) as HTMLButtonElement;
  expect(dog.disabled).toBe(true);
  expect(dance.disabled).toBe(true);
  fireEvent.click(dog);
  fireEvent.click(dance);
  expect(voice.start).toHaveBeenCalledTimes(1);
  expect(voice.stop).not.toHaveBeenCalled();
  expect(base.onDance).not.toHaveBeenCalled();
  expect(base.onVoiceQuery).not.toHaveBeenCalled();
});

it('stops dancing when the user starts voice recognition', () => {
  const base = props();
  render(<XiaoXCompanion {...base} dancing />);
  openVoice();
  expect(base.onDance).toHaveBeenCalledTimes(1);
  expect(voice.start).toHaveBeenCalledTimes(1);
  expect(base.onVoiceQuery).not.toHaveBeenCalled();
});

it('automatically fills extracted name and location rather than the entire utterance', () => {
  const base = props();
  render(<XiaoXCompanion {...base} />);
  openVoice();
  const fields = { query: '测试门店', location: '杭州 西湖区', needs_clarification: false };
  act(() => voice.receiveTranscript('帮我查一下杭州西湖区的测试门店', fields));
  expect(base.onVoiceQuery).toHaveBeenCalledExactlyOnceWith(fields);
  expect((screen.getByLabelText('提取的门店或公司名称') as HTMLTextAreaElement).value).toBe('测试门店');
  expect(screen.getByText('已自动填入查询栏，可以直接修改。')).toBeTruthy();
  expect(screen.queryByRole('button', { name: '确认填入' })).toBeNull();
  expect(screen.queryByRole('button', { name: '填入查询栏' })).toBeNull();
});

it.each([
  undefined,
  { query: '', location: '杭州', needs_clarification: false },
  { query: '   ', location: '', needs_clarification: false },
  { query: '店', location: '', needs_clarification: false },
  { query: '可能的门店', location: '', needs_clarification: true },
])('does not fill empty or uncertain keywords and offers a manual name field', fields => {
  const base = props();
  render(<XiaoXCompanion {...base} />);
  openVoice();
  act(() => voice.receiveTranscript('谢谢你，今天辛苦了', fields));
  expect(base.onVoiceQuery).not.toHaveBeenCalled();
  expect((screen.getByLabelText('提取的门店或公司名称') as HTMLTextAreaElement).value).toBe('');
  const apply = screen.getByRole('button', { name: '填入查询栏' }) as HTMLButtonElement;
  expect(apply.disabled).toBe(true);
  fireEvent.click(apply);
  expect(base.onVoiceQuery).not.toHaveBeenCalled();
});

it('lets the user clear a mistaken recognition and type a replacement', () => {
  const base = props();
  render(<XiaoXCompanion {...base} />);
  openVoice();
  act(() => voice.receiveTranscript('识别错误的门店', { query: '识别错误的门店', location: '', needs_clarification: false }));
  base.onVoiceQuery.mockClear();
  fireEvent.change(screen.getByLabelText('提取的门店或公司名称'), { target: { value: '' } });
  const editor = screen.getByLabelText('提取的门店或公司名称') as HTMLTextAreaElement;
  expect(editor.value).toBe('');
  expect((screen.getByRole('button', { name: '填入查询栏' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(editor, { target: { value: '正确门店' } });
  expect(base.onVoiceQuery).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '填入查询栏' }));
  expect(base.onVoiceQuery).toHaveBeenCalledExactlyOnceWith({ query: '正确门店', location: '', needs_clarification: false });
});

it('cancels recording and discards the draft when navigating to another investigation', () => {
  const base = props();
  const { rerender } = render(<XiaoXCompanion {...base} busy />);
  openVoice();
  act(() => voice.receiveTranscript('旧门店', { query: '旧门店', location: '', needs_clarification: false }));
  voice.cancel.mockClear();

  rerender(<XiaoXCompanion {...base} routeKey="/investigations/another/identity" />);
  expect(voice.cancel).toHaveBeenCalled();
  expect(screen.queryByRole('heading', { name: '说给小 X 听' })).toBeNull();
  expect(base.onVoiceQuery).not.toHaveBeenCalled();
  openVoice();
  const nextDraft = screen.queryByLabelText('提取的门店或公司名称') as HTMLTextAreaElement | null;
  expect(nextDraft?.value ?? '').toBe('');
  expect(screen.queryByDisplayValue('旧门店')).toBeNull();
});

it('closes voice input without applying a draft held while busy', () => {
  const base = props();
  render(<XiaoXCompanion {...base} busy />);
  openVoice();
  act(() => voice.receiveTranscript('另一个门店', { query: '另一个门店', location: '', needs_clarification: false }));
  voice.cancel.mockClear();

  fireEvent.click(screen.getByRole('button', { name: '关闭语音输入' }));
  expect(voice.cancel).toHaveBeenCalled();
  expect(base.onVoiceQuery).not.toHaveBeenCalled();
  expect(screen.queryByRole('heading', { name: '说给小 X 听' })).toBeNull();
});

it('allows recording while busy but waits until the investigation is idle to apply the draft', () => {
  const base = props();
  const { rerender } = render(<XiaoXCompanion {...base} activity="thinking" busy />);
  openVoice();
  expect(voice.start).toHaveBeenCalledTimes(1);
  voice.cancel.mockClear();
  const fields = { query: '下一个门店', location: '上海', needs_clarification: false };
  act(() => voice.receiveTranscript('查查上海的下一个门店', fields));
  const apply = screen.getByRole('button', { name: '填入查询栏' }) as HTMLButtonElement;
  expect(apply.disabled).toBe(true);
  fireEvent.click(apply);
  expect(base.onVoiceQuery).not.toHaveBeenCalled();
  expect(voice.cancel).not.toHaveBeenCalled();
  rerender(<XiaoXCompanion {...base} />);
  expect(base.onVoiceQuery).not.toHaveBeenCalled();
  expect((screen.getByRole('button', { name: '填入查询栏' }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: '填入查询栏' }));
  expect(base.onVoiceQuery).toHaveBeenCalledExactlyOnceWith(fields);
});

it('does not cancel an ongoing recording when an investigation becomes busy', () => {
  const base = props();
  const { rerender } = render(<XiaoXCompanion {...base} />);
  openVoice();
  voice.listening = true;
  voice.cancel.mockClear();
  rerender(<XiaoXCompanion {...base} activity="thinking" busy />);
  expect(voice.cancel).not.toHaveBeenCalled();
  const dog = screen.getByRole('button', { name: '点击小 X，结束录音' }) as HTMLButtonElement;
  expect(dog.disabled).toBe(false);
  fireEvent.click(dog);
  expect(voice.stop).toHaveBeenCalledTimes(1);
});
