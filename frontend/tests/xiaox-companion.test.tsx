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
    onVoiceQuery: vi.fn((_fields: VoiceFields) => true),
  };
}

function openVoice() {
  const starts = voice.start.mock.calls.length;
  const stops = voice.stop.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: '打开小 X 语音查案提示' }));
  expect(screen.getByRole('heading', { name: '说给小 X 听' })).toBeTruthy();
  expect(voice.start).toHaveBeenCalledTimes(starts);
  expect(voice.stop).toHaveBeenCalledTimes(stops);
}

function startVoice() {
  openVoice();
  fireEvent.click(screen.getByRole('button', { name: '开始录音' }));
}

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;
  readonly isPrimary: boolean;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? 'mouse';
    this.isPrimary = init.isPrimary ?? true;
  }
}

function draggableCompanion() {
  const base = props();
  const rendered = render(<XiaoXCompanion {...base} />);
  const companion = screen.getByRole('complementary', { name: '小 X 常驻助手' });
  const dog = screen.getByRole('button', { name: '打开小 X 语音查案提示' });
  vi.spyOn(companion, 'getBoundingClientRect').mockImplementation(() => {
    const x = parseFloat(companion.style.left) || 800;
    const y = parseFloat(companion.style.top) || 600;
    return { x, y, left: x, top: y, right: x + 140, bottom: y + 140, width: 140, height: 140, toJSON: () => ({}) };
  });
  Object.assign(dog, {
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => true),
  });
  return { ...rendered, base, companion, dog };
}

function dragDog(dog: HTMLElement, x: number, y: number) {
  fireEvent.pointerDown(dog, { pointerId: 1, button: 0, clientX: 860, clientY: 660 });
  fireEvent.pointerMove(dog, { pointerId: 1, buttons: 1, clientX: x, clientY: y });
  fireEvent.pointerUp(dog, { pointerId: 1, button: 0, clientX: x, clientY: y });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('PointerEvent', TestPointerEvent);
  vi.stubGlobal('innerWidth', 1024);
  vi.stubGlobal('innerHeight', 768);
  sessionStorage.clear();
  voice.supported = true;
  voice.listening = false;
  voice.processing = false;
  voice.level = 0;
  voice.interim = '';
  voice.message = '';
  voice.receiveTranscript = () => {};
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('keeps the companion present as investigation activity and routes change', () => {
  const base = props();
  const { rerender } = render(<XiaoXCompanion {...base} activity="thinking" busy />);
  const companion = screen.getByRole('complementary', { name: '小 X 常驻助手' });
  expect(screen.getByTestId('companion-motion').getAttribute('data-activity')).toBe('thinking');

  rerender(<XiaoXCompanion {...base} activity="complete" routeKey="/investigations/example/report" />);
  expect(screen.getByRole('complementary', { name: '小 X 常驻助手' })).toBe(companion);
  expect(screen.getByTestId('companion-motion').getAttribute('data-activity')).toBe('complete');
});

it('shows the character and a visible voice-case entry without a separate dance button', () => {
  const base = props();
  render(<XiaoXCompanion {...base} />);
  const dog = screen.getByRole('button', { name: '打开小 X 语音查案提示' });
  expect(dog.contains(screen.getByTestId('companion-motion'))).toBe(true);
  const entry = screen.getByRole('button', { name: '语音查案' });
  expect(screen.getAllByRole('button')).toEqual([dog, entry]);
  expect(screen.queryByRole('button', { name: /跳舞/ })).toBeNull();
  expect(voice.start).not.toHaveBeenCalled();
  expect(base.onVoiceQuery).not.toHaveBeenCalled();
});

it('opens the voice-case instructions without recording until the explicit start button is pressed', () => {
  const base = props();
  render(<XiaoXCompanion {...base} />);
  expect(voice.start).not.toHaveBeenCalled();
  openVoice();
  openVoice();
  expect(voice.start).not.toHaveBeenCalled();
  expect(voice.stop).not.toHaveBeenCalled();
  expect(base.onVoiceQuery).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '开始录音' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '开始录音' }));
  expect(voice.start).toHaveBeenCalledTimes(1);
});

it('opens the same instructions from the visible voice-case entry without opening the microphone', () => {
  render(<XiaoXCompanion {...props()} />);
  fireEvent.click(screen.getByRole('button', { name: '语音查案' }));
  expect(screen.getByRole('heading', { name: '说给小 X 听' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '开始录音' })).toBeTruthy();
  expect(voice.start).not.toHaveBeenCalled();
  expect(voice.stop).not.toHaveBeenCalled();
});

it('explains the dog gestures and removes the separate enterprise arrow', () => {
  render(<XiaoXCompanion {...props()} />);
  expect(screen.getByText('按住拖动，点击查看语音查案提示')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /企业查询/ })).toBeNull();
  expect(screen.queryByTestId('enterprise-agent')).toBeNull();
});

it('moves the dog without starting voice recognition on the release click', () => {
  const { dog, companion } = draggableCompanion();
  fireEvent.pointerDown(dog, { pointerId: 1, button: 0, clientX: 860, clientY: 660 });
  fireEvent.pointerMove(dog, { pointerId: 1, buttons: 1, clientX: 660, clientY: 460 });
  expect(companion.getAttribute('data-dragging')).toBe('true');
  expect(parseFloat(companion.style.left)).toBe(600);
  expect(parseFloat(companion.style.top)).toBe(400);
  fireEvent.pointerUp(dog, { pointerId: 1, button: 0, clientX: 660, clientY: 460 });
  fireEvent.click(dog, { detail: 1 });
  expect(companion.getAttribute('data-dragging')).not.toBe('true');
  expect(voice.start).not.toHaveBeenCalled();
  expect(screen.queryByRole('heading', { name: '说给小 X 听' })).toBeNull();

  fireEvent.pointerDown(dog, { pointerId: 2, button: 0, clientX: 660, clientY: 460 });
  fireEvent.pointerUp(dog, { pointerId: 2, button: 0, clientX: 660, clientY: 460 });
  fireEvent.click(dog, { detail: 1 });
  expect(screen.getByRole('heading', { name: '说给小 X 听' })).toBeTruthy();
  expect(voice.start).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '开始录音' }));
  expect(voice.start).toHaveBeenCalledTimes(1);
});

it('treats slight mouse movement as a click and preserves keyboard activation after dragging', () => {
  const { dog } = draggableCompanion();
  fireEvent.pointerDown(dog, { pointerId: 1, button: 0, clientX: 860, clientY: 660 });
  fireEvent.pointerMove(dog, { pointerId: 1, buttons: 1, clientX: 863, clientY: 662 });
  fireEvent.pointerUp(dog, { pointerId: 1, button: 0, clientX: 863, clientY: 662 });
  fireEvent.click(dog, { detail: 1 });
  expect(voice.start).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '开始录音' }));
  expect(voice.start).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: '关闭语音输入' }));

  dragDog(dog, 660, 460);
  fireEvent.click(dog, { detail: 0 });
  expect(voice.start).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('heading', { name: '说给小 X 听' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '开始录音' }));
  expect(voice.start).toHaveBeenCalledTimes(2);
});

it.each(['pointerCancel', 'lostPointerCapture'] as const)('cleans up %s without recording and permits the next intentional click', interruptedEvent => {
  const { dog, companion } = draggableCompanion();
  fireEvent.pointerDown(dog, { pointerId: 1, button: 0, clientX: 860, clientY: 660 });
  fireEvent.pointerMove(dog, { pointerId: 1, buttons: 1, clientX: 660, clientY: 460 });
  fireEvent[interruptedEvent](dog, { pointerId: 1 });
  fireEvent.click(dog, { detail: 1 });
  expect(companion.getAttribute('data-dragging')).not.toBe('true');
  expect(voice.start).not.toHaveBeenCalled();
  fireEvent.pointerDown(dog, { pointerId: 2, button: 0, clientX: 660, clientY: 460 });
  fireEvent.pointerUp(dog, { pointerId: 2, button: 0, clientX: 660, clientY: 460 });
  fireEvent.click(dog, { detail: 1 });
  expect(voice.start).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '开始录音' }));
  expect(voice.start).toHaveBeenCalledTimes(1);
});

it('keeps the dog reachable at viewport edges and after a window resize', () => {
  const { dog, companion } = draggableCompanion();
  dragDog(dog, -300, -300);
  expect(parseFloat(companion.style.left)).toBeGreaterThanOrEqual(12);
  expect(parseFloat(companion.style.top)).toBeGreaterThanOrEqual(32);

  dragDog(dog, 3000, 3000);
  expect(parseFloat(companion.style.left) + 140).toBeLessThanOrEqual(window.innerWidth - 12);
  expect(parseFloat(companion.style.top) + 140).toBeLessThanOrEqual(window.innerHeight - 12);
  vi.stubGlobal('innerWidth', 480);
  vi.stubGlobal('innerHeight', 360);
  fireEvent(window, new Event('resize'));
  expect(parseFloat(companion.style.left) + 140).toBeLessThanOrEqual(468);
  expect(parseFloat(companion.style.top) + 140).toBeLessThanOrEqual(348);
  expect(voice.start).not.toHaveBeenCalled();
});

it('places the mobile voice panel above or below the complete companion without overlap or viewport overflow', () => {
  vi.stubGlobal('innerWidth', 390);
  vi.stubGlobal('innerHeight', 844);
  const box = (left: number, top: number, width: number, height: number) => ({
    x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}),
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    // Include the character and its visible voice-case entry in the body size.
    if (this.classList.contains('jw-xiaox-companion')) return box(parseFloat(this.style.left) || 282, parseFloat(this.style.top) || 644, 96, 128);
    if (this.classList.contains('jw-companion-voice')) return box(parseFloat(this.style.left) || 12, parseFloat(this.style.top) || 12, parseFloat(this.style.width) || 340, 310);
    if (this.classList.contains('jw-companion-hint')) return box(0, 0, 150, 40);
    return box(0, 0, 0, 0);
  });
  render(<XiaoXCompanion {...props()} />);
  openVoice();
  const companion = screen.getByRole('complementary', { name: '小 X 常驻助手' });
  const panel = screen.getByRole('region', { name: '说给小 X 听' });
  const dog = screen.getByRole('button', { name: '打开小 X 语音查案提示' });
  const assertWithinViewport = () => {
    for (const element of [panel, companion]) {
      const rect = element.getBoundingClientRect();
      expect(rect.left).toBeGreaterThanOrEqual(12);
      expect(rect.top).toBeGreaterThanOrEqual(12);
      expect(rect.right).toBeLessThanOrEqual(378);
      expect(rect.bottom).toBeLessThanOrEqual(832);
    }
  };
  assertWithinViewport();
  expect(panel.getBoundingClientRect().bottom + 12).toBeLessThanOrEqual(companion.getBoundingClientRect().top);

  // When the user puts the dog near the top, the panel must use the space below.
  const original = companion.getBoundingClientRect();
  fireEvent.pointerDown(dog, { pointerId: 1, button: 0, clientX: original.left + 48, clientY: original.top + 48 });
  fireEvent.pointerMove(dog, { pointerId: 1, buttons: 1, clientX: 60, clientY: 68 });
  fireEvent.pointerUp(dog, { pointerId: 1, button: 0, clientX: 60, clientY: 68 });
  assertWithinViewport();
  expect(companion.getBoundingClientRect().bottom + 12).toBeLessThanOrEqual(panel.getBoundingClientRect().top);
  expect(voice.start).not.toHaveBeenCalled();
});

it('preserves the dragged position while the investigation route changes', () => {
  const { dog, companion, base, rerender } = draggableCompanion();
  dragDog(dog, 660, 460);
  const position = { left: companion.style.left, top: companion.style.top };
  rerender(<XiaoXCompanion {...base} routeKey="/investigations/next/report" activity="complete" />);
  expect(companion.style.left).toBe(position.left);
  expect(companion.style.top).toBe(position.top);
  expect(voice.start).not.toHaveBeenCalled();
});

it('only stops recording through the explicit end button while the dog keeps its listening motion', () => {
  const base = props();
  const { rerender } = render(<XiaoXCompanion {...base} />);
  startVoice();
  voice.listening = true;
  voice.interim = '测试门店';
  rerender(<XiaoXCompanion {...base} />);
  expect(screen.getByTestId('companion-motion').getAttribute('data-activity')).toBe('listening');
  openVoice();
  fireEvent.click(screen.getByRole('button', { name: '语音查案' }));
  expect(voice.stop).not.toHaveBeenCalled();
  expect(voice.start).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: '结束录音' }));
  expect(voice.stop).toHaveBeenCalledTimes(1);
  expect(voice.start).toHaveBeenCalledTimes(1);
  expect(base.onVoiceQuery).not.toHaveBeenCalled();
});

it('prevents restarting recording while speech is being recognized', () => {
  const base = props();
  const { rerender } = render(<XiaoXCompanion {...base} />);
  startVoice();
  voice.processing = true;
  rerender(<XiaoXCompanion {...base} />);
  const dog = screen.getByRole('button', { name: '打开小 X 语音查案提示' }) as HTMLButtonElement;
  const recording = screen.getByRole('button', { name: '正在识别…' }) as HTMLButtonElement;
  expect(recording.disabled).toBe(true);
  expect(screen.getByTestId('companion-motion').getAttribute('data-activity')).toBe('thinking');
  fireEvent.click(dog);
  fireEvent.click(recording);
  expect(voice.start).toHaveBeenCalledTimes(1);
  expect(voice.stop).not.toHaveBeenCalled();
  expect(base.onVoiceQuery).not.toHaveBeenCalled();
});

it('retries a failed recording only after the explicit retry button is pressed', () => {
  const base = props();
  const { rerender } = render(<XiaoXCompanion {...base} />);
  startVoice();
  voice.message = '麦克风未获授权，请允许访问后重试。';
  rerender(<XiaoXCompanion {...base} />);
  expect(screen.getByText(voice.message)).toBeTruthy();
  openVoice();
  expect(voice.start).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: '重新录音' }));
  expect(voice.start).toHaveBeenCalledTimes(2);
  expect(voice.stop).not.toHaveBeenCalled();
});

it('preserves the completed draft when reopening the instructions and clears it only for an explicit retry', () => {
  const base = props();
  render(<XiaoXCompanion {...base} />);
  startVoice();
  act(() => voice.receiveTranscript('测试门店', { query: '测试门店', location: '杭州', needs_clarification: false }));
  openVoice();
  expect((screen.getByLabelText('提取的门店或公司名称') as HTMLInputElement).value).toBe('测试门店');
  expect(voice.start).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: '重新录音' }));
  expect(voice.start).toHaveBeenCalledTimes(2);
  expect(screen.queryByLabelText('提取的门店或公司名称')).toBeNull();
});

it('keeps the instructions available but disables recording when microphone capture is unsupported', () => {
  voice.supported = false;
  render(<XiaoXCompanion {...props()} />);
  openVoice();
  const start = screen.getByRole('button', { name: '开始录音' }) as HTMLButtonElement;
  expect(start.disabled).toBe(true);
  fireEvent.click(start);
  expect(voice.start).not.toHaveBeenCalled();
});

it('still allows repositioning while recognition is processing without restarting it', () => {
  const { dog, companion, base, rerender } = draggableCompanion();
  voice.processing = true;
  rerender(<XiaoXCompanion {...base} />);
  voice.cancel.mockClear();
  dragDog(dog, 660, 460);
  fireEvent.click(dog, { detail: 1 });
  expect(parseFloat(companion.style.left)).toBe(600);
  expect(parseFloat(companion.style.top)).toBe(400);
  expect(voice.start).not.toHaveBeenCalled();
  expect(voice.stop).not.toHaveBeenCalled();
  expect(voice.cancel).not.toHaveBeenCalled();
});

it('automatically fills extracted name and location rather than the entire utterance', () => {
  const base = props();
  render(<XiaoXCompanion {...base} />);
  startVoice();
  const fields = { query: '测试门店', location: '杭州 西湖区', needs_clarification: false };
  act(() => voice.receiveTranscript('帮我查一下杭州西湖区的测试门店', fields));
  expect(base.onVoiceQuery).toHaveBeenCalledExactlyOnceWith(fields);
  expect((screen.getByLabelText('提取的门店或公司名称') as HTMLTextAreaElement).value).toBe('测试门店');
  expect(screen.getByText('名称已填入，点击下方按钮前往查询栏。')).toBeTruthy();
  expect(screen.queryByRole('button', { name: '确认填入' })).toBeNull();
  expect(screen.queryByRole('button', { name: '填入查询栏' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '前往查询栏' }));
  expect(base.onVoiceQuery).toHaveBeenLastCalledWith(fields, true);
  expect(screen.queryByRole('heading', { name: '说给小 X 听' })).toBeNull();
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
  startVoice();
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
  startVoice();
  act(() => voice.receiveTranscript('识别错误的门店', { query: '识别错误的门店', location: '', needs_clarification: false }));
  base.onVoiceQuery.mockClear();
  fireEvent.change(screen.getByLabelText('提取的门店或公司名称'), { target: { value: '' } });
  const editor = screen.getByLabelText('提取的门店或公司名称') as HTMLTextAreaElement;
  expect(editor.value).toBe('');
  expect((screen.getByRole('button', { name: '填入查询栏' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(editor, { target: { value: '正确门店' } });
  expect(base.onVoiceQuery).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '填入查询栏' }));
  expect(base.onVoiceQuery).toHaveBeenCalledExactlyOnceWith({ query: '正确门店', location: '', needs_clarification: false }, true);
  expect(screen.queryByRole('heading', { name: '说给小 X 听' })).toBeNull();
});

it('cancels recording and discards the draft when navigating to another investigation', () => {
  const base = props();
  const { rerender } = render(<XiaoXCompanion {...base} busy />);
  startVoice();
  act(() => voice.receiveTranscript('旧门店', { query: '旧门店', location: '', needs_clarification: false }));
  voice.cancel.mockClear();

  rerender(<XiaoXCompanion {...base} routeKey="/investigations/another/identity" />);
  expect(voice.cancel).toHaveBeenCalled();
  expect(screen.queryByRole('heading', { name: '说给小 X 听' })).toBeNull();
  expect(base.onVoiceQuery).not.toHaveBeenCalled();
  startVoice();
  const nextDraft = screen.queryByLabelText('提取的门店或公司名称') as HTMLTextAreaElement | null;
  expect(nextDraft?.value ?? '').toBe('');
  expect(screen.queryByDisplayValue('旧门店')).toBeNull();
});

it('closes voice input without applying a draft held while busy', () => {
  const base = props();
  render(<XiaoXCompanion {...base} busy />);
  startVoice();
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
  startVoice();
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
  expect(base.onVoiceQuery).toHaveBeenCalledExactlyOnceWith(fields, true);
});

it('keeps the editable result and transfer button when applying fails', () => {
  const base = props();
  base.onVoiceQuery.mockReturnValue(false);
  render(<XiaoXCompanion {...base} />);
  startVoice();
  act(() => voice.receiveTranscript('测试门店', { query: '测试门店', location: '', needs_clarification: false }));
  fireEvent.click(screen.getByRole('button', { name: '填入查询栏' }));
  expect(screen.getByRole('alert').textContent).toContain('暂时无法填入');
  expect(screen.getByRole('button', { name: '填入查询栏' })).toBeTruthy();
  expect((screen.getByLabelText('提取的门店或公司名称') as HTMLInputElement).value).toBe('测试门店');
});

it('does not cancel an ongoing recording when an investigation becomes busy', () => {
  const base = props();
  const { rerender } = render(<XiaoXCompanion {...base} />);
  startVoice();
  voice.listening = true;
  voice.cancel.mockClear();
  rerender(<XiaoXCompanion {...base} activity="thinking" busy />);
  expect(voice.cancel).not.toHaveBeenCalled();
  const stop = screen.getByRole('button', { name: '结束录音' }) as HTMLButtonElement;
  expect(stop.disabled).toBe(false);
  openVoice();
  expect(voice.stop).not.toHaveBeenCalled();
  fireEvent.click(stop);
  expect(voice.stop).toHaveBeenCalledTimes(1);
});
