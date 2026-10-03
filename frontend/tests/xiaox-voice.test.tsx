import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useXiaoXVoice, type VoiceFields } from '../src/useXiaoXVoice';
import { captureVoicePcm, encodeVoiceWav } from '../src/xiaoxVoiceCapture';

type AudioEvent = { inputBuffer: { getChannelData: (channel: number) => Float32Array }; outputBuffer: { getChannelData: (channel: number) => Float32Array } };
class MockContext {
  static instances: MockContext[] = [];
  sampleRate = 48000;
  state = 'running';
  destination = {};
  source = { connect: vi.fn(), disconnect: vi.fn() };
  processor = { connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null as ((event: AudioEvent) => void) | null };
  resume = vi.fn().mockResolvedValue(undefined);
  close = vi.fn(async () => { this.state = 'closed'; });
  createMediaStreamSource = vi.fn(() => this.source);
  createScriptProcessor = vi.fn(() => this.processor);
  constructor() { MockContext.instances.push(this); }
}

function stream() {
  const track = { stop: vi.fn(), onended: null as (() => void) | null };
  return { getTracks: () => [track], getAudioTracks: () => [track], track };
}
const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
const getUserMedia = vi.fn();
const fetchMock = vi.fn();
let microphone = stream();

function latest() { return MockContext.instances[MockContext.instances.length - 1]; }
function emit(samples = new Float32Array(12000).fill(0.25), context = latest()) {
  const output = new Float32Array(samples.length).fill(1);
  context.processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => samples }, outputBuffer: { getChannelData: () => output } });
  return output;
}
function resultResponse(text = '杭州银行', fields: VoiceFields = { query: text.trim(), location: '', needs_clarification: false }) {
  return { ok: true, json: async () => ({ text, ...fields }) };
}
function headerText(view: DataView, start: number, length: number) {
  return Array.from({ length }, (_, index) => String.fromCharCode(view.getUint8(start + index))).join('');
}

beforeEach(() => {
  MockContext.instances = [];
  microphone = stream();
  getUserMedia.mockReset().mockResolvedValue(microphone);
  fetchMock.mockReset().mockResolvedValue(resultResponse());
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  vi.stubGlobal('AudioContext', MockContext);
  vi.stubGlobal('AudioWorkletNode', undefined);
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (originalMediaDevices) Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices);
  else Reflect.deleteProperty(navigator, 'mediaDevices');
});

it('only opens the microphone after a click and sends real PCM WAV when stopped', async () => {
  let resolveRequest!: (value: ReturnType<typeof resultResponse>) => void;
  fetchMock.mockImplementationOnce(() => new Promise(resolve => { resolveRequest = resolve; }));
  const onTranscript = vi.fn();
  const { result } = renderHook(() => useXiaoXVoice(onTranscript));
  expect(result.current.supported).toBe(true);
  expect(getUserMedia).not.toHaveBeenCalled();
  expect(MockContext.instances).toHaveLength(0);
  await act(async () => result.current.start());
  expect(getUserMedia).toHaveBeenCalledExactlyOnceWith({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false,
  });
  expect(result.current.listening).toBe(true);
  let output!: Float32Array;
  act(() => { output = emit(); });
  expect(output.every(sample => sample === 0)).toBe(true);
  expect(result.current.level).toBeGreaterThan(0);
  expect(onTranscript).not.toHaveBeenCalled();
  act(() => result.current.stop());
  expect(result.current.listening).toBe(false);
  expect(result.current.processing).toBe(true);
  expect(microphone.track.stop).toHaveBeenCalledOnce();
  expect(latest().source.disconnect).toHaveBeenCalledOnce();
  expect(latest().processor.disconnect).toHaveBeenCalledOnce();
  expect(latest().close).toHaveBeenCalledOnce();
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe('/api/voice/transcribe');
  expect(options.method).toBe('POST');
  expect(options.headers).toEqual({ 'Content-Type': 'audio/wav' });
  const wav = new DataView(options.body);
  expect(headerText(wav, 0, 4)).toBe('RIFF');
  expect(headerText(wav, 8, 4)).toBe('WAVE');
  expect(wav.getUint16(22, true)).toBe(1);
  expect(wav.getUint32(24, true)).toBe(16000);
  expect(wav.getUint16(34, true)).toBe(16);
  expect(wav.getUint32(40, true)).toBe(8000);
  expect(wav.getInt16(44, true)).toBe(8192);
  await act(async () => resolveRequest(resultResponse(' 杭州银行 ')));
  expect(onTranscript).toHaveBeenCalledExactlyOnceWith('杭州银行', { query: '杭州银行', location: '', needs_clarification: false });
  expect(result.current.processing).toBe(false);
  expect(result.current.message).toContain('填入');
});

it('resamples chunk boundaries, writes little-endian PCM, and clips out-of-range samples', () => {
  const wav = new DataView(encodeVoiceWav([new Float32Array([1, 1]), new Float32Array([1, -1, -1, -1])], 48000));
  expect(wav.byteLength).toBe(48);
  expect(wav.getUint32(4, true)).toBe(40);
  expect(wav.getUint32(28, true)).toBe(32000);
  expect(wav.getUint16(32, true)).toBe(2);
  expect(wav.getInt16(44, true)).toBe(32767);
  expect(wav.getInt16(46, true)).toBe(-32768);
  const clipped = new DataView(encodeVoiceWav([new Float32Array([2, -2, NaN])], 16000));
  expect([44, 46, 48].map(index => clipped.getInt16(index, true))).toEqual([32767, -32768, 0]);
  const fractional = new DataView(encodeVoiceWav([new Float32Array(44100).fill(0.5)], 44100));
  expect(fractional.byteLength).toBe(32044);
  expect(fractional.getInt16(44, true)).toBe(16384);
});

it.each([
  ['NotAllowedError', '未获授权'],
  ['NotFoundError', '没有找到'],
  ['NotReadableError', '被占用'],
])('handles microphone %s without uploading audio', async (name, message) => {
  getUserMedia.mockRejectedValueOnce(new DOMException('device error', name));
  const onTranscript = vi.fn();
  const { result } = renderHook(() => useXiaoXVoice(onTranscript));
  await act(async () => result.current.start());
  expect(result.current.listening).toBe(false);
  expect(result.current.processing).toBe(false);
  expect(result.current.message).toContain(message);
  expect(latest().close).toHaveBeenCalledOnce();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(onTranscript).not.toHaveBeenCalled();
});

it('provides a text fallback without getUserMedia', () => {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
  const { result } = renderHook(() => useXiaoXVoice(vi.fn()));
  expect(result.current.supported).toBe(false);
  act(() => result.current.start());
  expect(result.current.message).toContain('无法使用麦克风');
  expect(getUserMedia).not.toHaveBeenCalled();
});

it('stops a late permission grant after cancellation without creating an audio graph', async () => {
  let grant!: (value: ReturnType<typeof stream>) => void;
  getUserMedia.mockImplementationOnce(() => new Promise(resolve => { grant = resolve; }));
  const { result } = renderHook(() => useXiaoXVoice(vi.fn()));
  act(() => result.current.start());
  act(() => result.current.cancel());
  expect(latest().close).toHaveBeenCalledOnce();
  await act(async () => grant(microphone));
  expect(microphone.track.stop).toHaveBeenCalledOnce();
  expect(latest().createMediaStreamSource).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});

it('aborts a transcription request and ignores its late text during a replacement recording', async () => {
  let resolveOld!: (value: ReturnType<typeof resultResponse>) => void;
  fetchMock.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  const onTranscript = vi.fn();
  const { result } = renderHook(() => useXiaoXVoice(onTranscript));
  await act(async () => result.current.start());
  act(() => { emit(); result.current.stop(); });
  const oldSignal = fetchMock.mock.calls[0][1].signal as AbortSignal;
  act(() => result.current.cancel());
  expect(oldSignal.aborted).toBe(true);
  await act(async () => result.current.start());
  await act(async () => resolveOld(resultResponse('旧门店')));
  expect(result.current.listening).toBe(true);
  expect(onTranscript).not.toHaveBeenCalled();
});

it('releases a live microphone and ignores queued audio callbacks on unmount', async () => {
  const onTranscript = vi.fn();
  const { result, unmount } = renderHook(() => useXiaoXVoice(onTranscript));
  await act(async () => result.current.start());
  const queued = latest().processor.onaudioprocess;
  unmount();
  expect(microphone.track.stop).toHaveBeenCalledOnce();
  expect(latest().close).toHaveBeenCalledOnce();
  expect(latest().processor.onaudioprocess).toBeNull();
  act(() => queued?.({ inputBuffer: { getChannelData: () => new Float32Array(12000) }, outputBuffer: { getChannelData: () => new Float32Array(12000) } }));
  expect(fetchMock).not.toHaveBeenCalled();
  expect(onTranscript).not.toHaveBeenCalled();
});

it('stops after two seconds of silence following speech', async () => {
  const onTranscript = vi.fn();
  const { result } = renderHook(() => useXiaoXVoice(onTranscript));
  await act(async () => result.current.start());
  await act(async () => { emit(); emit(new Float32Array(96000)); });
  expect(microphone.track.stop).toHaveBeenCalledOnce();
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(onTranscript).toHaveBeenCalledExactlyOnceWith('杭州银行', { query: '杭州银行', location: '', needs_clarification: false });
});

it('caps recording and bounds requests that never respond', async () => {
  vi.useFakeTimers();
  fetchMock.mockReturnValueOnce(new Promise(() => {}));
  const onTranscript = vi.fn();
  const { result } = renderHook(() => useXiaoXVoice(onTranscript));
  await act(async () => result.current.start());
  act(() => { emit(); vi.advanceTimersByTime(20000); });
  expect(result.current.processing).toBe(true);
  expect(microphone.track.stop).toHaveBeenCalledOnce();
  const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
  act(() => vi.advanceTimersByTime(45000));
  expect(signal.aborted).toBe(true);
  expect(result.current.processing).toBe(false);
  expect(result.current.message).toContain('超时');
  expect(onTranscript).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it('does not send an empty recording', async () => {
  const { result } = renderHook(() => useXiaoXVoice(vi.fn()));
  await act(async () => result.current.start());
  act(() => result.current.stop());
  expect(fetchMock).not.toHaveBeenCalled();
  expect(result.current.message).toContain('录音太短');
  expect(microphone.track.stop).toHaveBeenCalledOnce();
});

it.each([
  [{ ok: false, json: async () => ({ code: 'no_speech', message: '没有听清，请重试。' }) }, '没有听清'],
  [{ ok: false, json: async () => ({ message: '语音模型正在准备，请稍后重试。' }) }, '正在准备'],
  [resultResponse(''), '没有听清'],
])('keeps the existing query when transcription returns no usable text', async (response, message) => {
  fetchMock.mockResolvedValueOnce(response);
  const onTranscript = vi.fn();
  const { result } = renderHook(() => useXiaoXVoice(onTranscript));
  await act(async () => result.current.start());
  await act(async () => { emit(); result.current.stop(); });
  expect(result.current.message).toContain(message);
  expect(result.current.processing).toBe(false);
  expect(onTranscript).not.toHaveBeenCalled();
});

it('uses the latest callback after an asynchronous transcript arrives', async () => {
  let resolveRequest!: (value: ReturnType<typeof resultResponse>) => void;
  fetchMock.mockImplementationOnce(() => new Promise(resolve => { resolveRequest = resolve; }));
  const original = vi.fn();
  const current = vi.fn();
  const { result, rerender } = renderHook(({ callback }) => useXiaoXVoice(callback), { initialProps: { callback: original } });
  await act(async () => result.current.start());
  await act(async () => { emit(); result.current.stop(); });
  expect(result.current.processing).toBe(true);
  rerender({ callback: current });
  const fields = { query: '测试公司', location: '杭州 西湖区', needs_clarification: false };
  await act(async () => resolveRequest(resultResponse('帮我查杭州西湖区的测试公司', fields)));
  expect(original).not.toHaveBeenCalled();
  expect(current).toHaveBeenCalledExactlyOnceWith('帮我查杭州西湖区的测试公司', fields);
});

it('treats older text-only responses as needing clarification rather than a company keyword', async () => {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ text: '谢谢你' }) });
  const onTranscript = vi.fn();
  const { result } = renderHook(() => useXiaoXVoice(onTranscript));
  await act(async () => result.current.start());
  await act(async () => { emit(); result.current.stop(); });
  expect(onTranscript).toHaveBeenCalledExactlyOnceWith('谢谢你', { query: '', location: '', needs_clarification: true });
  expect(result.current.message).toContain('还没确定');
});

it('does not promote malformed server metadata into reliable extracted fields', async () => {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ text: '模糊的语音', query: 123, location: ['杭州'], needs_clarification: 'false' }) });
  const onTranscript = vi.fn();
  const { result } = renderHook(() => useXiaoXVoice(onTranscript));
  await act(async () => result.current.start());
  await act(async () => { emit(); result.current.stop(); });
  expect(onTranscript).toHaveBeenCalledExactlyOnceWith('模糊的语音', { query: '', location: '', needs_clarification: true });
  expect(result.current.processing).toBe(false);
});

it('captures worklet PCM messages and cleans up its port, graph and module URL', async () => {
  const port = { onmessage: null as ((event: { data: Float32Array }) => void) | null, close: vi.fn() };
  const worklet = { port, connect: vi.fn(), disconnect: vi.fn() };
  class Worklet { constructor() { return worklet; } }
  vi.stubGlobal('AudioWorkletNode', Worklet);
  const createUrl = vi.fn().mockReturnValue('blob:voice-worklet');
  const revokeUrl = vi.fn();
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: createUrl, revokeObjectURL: revokeUrl }));
  const context = Object.assign(new MockContext(), { audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) } });
  const onSamples = vi.fn();
  const release = await captureVoicePcm(context as unknown as AudioContext, microphone as unknown as MediaStream, onSamples);
  expect(context.audioWorklet.addModule).toHaveBeenCalledWith('blob:voice-worklet');
  expect(context.createScriptProcessor).not.toHaveBeenCalled();
  const pcm = new Float32Array([0.2, 0.3]);
  port.onmessage?.({ data: pcm });
  expect(onSamples).toHaveBeenCalledExactlyOnceWith(pcm);
  release();
  expect(port.onmessage).toBeNull();
  expect(port.close).toHaveBeenCalledOnce();
  expect(worklet.disconnect).toHaveBeenCalledOnce();
  expect(context.source.disconnect).toHaveBeenCalledOnce();
  expect(revokeUrl).toHaveBeenCalledWith('blob:voice-worklet');
});
