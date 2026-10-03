import { useCallback, useEffect, useRef, useState } from 'react';
import { captureVoicePcm, encodeVoiceWav } from './xiaoxVoiceCapture';

export type VoiceFields = { query: string; location: string; needs_clarification: boolean };

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };
type VoiceSession = {
  chunks: Float32Array[];
  sampleRate: number;
  sampleCount: number;
  speechSamples: number;
  lastSpeechSample: number;
  stream?: MediaStream;
  context?: AudioContext;
  releaseCapture?: () => void;
  timer?: ReturnType<typeof setTimeout>;
  request?: AbortController;
  stopping: boolean;
};

const UNSUPPORTED = '当前页面无法使用麦克风，请用 HTTPS 或本机地址打开，也可以直接输入文字。';

function audioConstructor() {
  if (typeof window === 'undefined') return undefined;
  return window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
}

function captureSupported() {
  return Boolean(typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function' && audioConstructor());
}

function releaseAudio(session: VoiceSession) {
  clearTimeout(session.timer);
  session.timer = undefined;
  try { session.releaseCapture?.(); } catch { /* The audio graph may already be disconnected. */ }
  session.releaseCapture = undefined;
  session.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
  session.stream = undefined;
  const context = session.context;
  session.context = undefined;
  if (context && context.state !== 'closed') void context.close().catch(() => {});
}

function errorName(error: unknown) {
  return error && typeof error === 'object' && 'name' in error && typeof error.name === 'string' ? error.name : '';
}

function microphoneError(error: unknown) {
  switch (errorName(error)) {
    case 'NotAllowedError':
    case 'SecurityError':
      return '麦克风未获授权，请在浏览器中允许访问后重试，也可以直接输入文字。';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return '没有找到可用的麦克风，请检查设备连接后重试。';
    case 'NotReadableError':
    case 'TrackStartError':
      return '麦克风暂时无法使用，请检查设备是否被占用后重试。';
    default:
      return '麦克风未能启动，请检查浏览器权限和设备连接后重试。';
  }
}

/** Records only after start(), then fills a draft from our transcription service. */
export function useXiaoXVoice(onTranscript: (text: string, fields?: VoiceFields) => void) {
  const [supported] = useState(captureSupported);
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [level, setLevel] = useState(0);
  const [message, setMessage] = useState(() => supported ? '' : UNSUPPORTED);
  const [engineNotice, setEngineNotice] = useState('');
  const sessionRef = useRef<VoiceSession | null>(null);
  const transcriptRef = useRef(onTranscript);
  transcriptRef.current = onTranscript;

  const finish = useCallback((session: VoiceSession, nextMessage: string, text?: string, fields?: VoiceFields) => {
    if (sessionRef.current !== session) return;
    sessionRef.current = null;
    releaseAudio(session);
    session.request?.abort();
    session.chunks = [];
    setListening(false);
    setProcessing(false);
    setLevel(0);
    setMessage(nextMessage);
    if (text) transcriptRef.current(text, fields);
  }, []);

  const stop = useCallback(() => {
    const session = sessionRef.current;
    if (!session || session.stopping) return;
    session.stopping = true;
    releaseAudio(session);
    setListening(false);
    setLevel(0);
    if (session.sampleCount < session.sampleRate * 0.15) {
      finish(session, '录音太短，没有收集到清晰声音。点击「重新录音」，说完后点击「结束录音」。');
      return;
    }
    const audio = encodeVoiceWav(session.chunks, session.sampleRate);
    session.chunks = [];
    session.request = new AbortController();
    setProcessing(true);
    setMessage('录音已结束，小 X 正在识别文字…');
    session.timer = setTimeout(() => finish(session, '语音识别超时，请稍后重试，或直接输入文字。'), 45000);
    void (async () => {
      try {
        const response = await fetch('/api/voice/transcribe', {
          method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: audio,
          signal: session.request!.signal,
        });
        const data: unknown = await response.json().catch(() => null);
        if (sessionRef.current !== session) return;
        const payload = data && typeof data === 'object' ? data as Record<string, unknown> : {};
        if (!response.ok) {
          const detail = typeof payload.message === 'string' ? payload.message
            : typeof payload.detail === 'string' ? payload.detail : '';
          finish(session, detail || '语音服务暂时无法识别，请重试，或直接输入文字。');
          return;
        }
        const text = typeof payload.text === 'string' ? payload.text.trim() : '';
        setEngineNotice(payload.degraded === true && typeof payload.engine_message === 'string' ? payload.engine_message : '');
        const fields: VoiceFields = {
          query: typeof payload.query === 'string' ? payload.query.slice(0, 80) : '',
          location: typeof payload.location === 'string' ? payload.location.slice(0, 60) : '',
          needs_clarification: payload.needs_clarification !== false,
        };
        finish(session, text ? (fields.needs_clarification ? '听到了，但还没确定要查哪一家。' : '已提取名称，请核对后填入查询栏。') : '没有听清，请靠近麦克风再说一次，或直接输入文字。', text, fields);
      } catch {
        if (sessionRef.current === session) finish(session, '语音服务暂时无法连接，请检查网络后重试，或直接输入文字。');
      }
    })();
  }, [finish]);

  const start = useCallback(() => {
    if (sessionRef.current) return;
    const Context = audioConstructor();
    if (!captureSupported() || !Context) { setMessage(UNSUPPORTED); return; }
    const session: VoiceSession = {
      chunks: [], sampleRate: 16000, sampleCount: 0, speechSamples: 0,
      lastSpeechSample: 0, stopping: false,
    };
    sessionRef.current = session;
    setListening(true);
    setProcessing(false);
    setLevel(0);
    setEngineNotice('');
    setMessage('正在开启麦克风，请允许浏览器使用麦克风…');
    session.timer = setTimeout(() => finish(session, '等待麦克风授权超时。允许访问后，请点击「重新录音」。'), 20000);
    void (async () => {
      try {
        // Create/resume during the user's click so browsers can unlock audio.
        const context = new Context();
        session.context = context;
        session.sampleRate = context.sampleRate;
        const resume = context.resume();
        // Attach rejection handling immediately while permission may still be pending.
        const resumed = resume.then(() => null, (error: unknown) => error);
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
        if (sessionRef.current !== session) { stream.getTracks().forEach(track => track.stop()); return; }
        session.stream = stream;
        const resumeError = await resumed;
        if (resumeError) throw resumeError;
        if (sessionRef.current !== session) return;
        const release = await captureVoicePcm(context, stream, samples => {
          if (sessionRef.current !== session || session.stopping) return;
          const remaining = Math.max(0, session.sampleRate * 20 - session.sampleCount);
          const chunk = new Float32Array(samples.subarray(0, remaining));
          if (!chunk.length) { stop(); return; }
          session.chunks.push(chunk);
          session.sampleCount += chunk.length;
          let squared = 0;
          for (const sample of chunk) squared += sample * sample;
          const rms = Math.sqrt(squared / chunk.length);
          setLevel(Math.min(1, rms * 8));
          if (rms > 0.008) {
            session.speechSamples += chunk.length;
            session.lastSpeechSample = session.sampleCount;
          }
          if (session.sampleCount >= session.sampleRate * 20 || (
            session.speechSamples >= session.sampleRate * 0.2 &&
            session.sampleCount - session.lastSpeechSample >= session.sampleRate * 2
          )) stop();
        });
        if (sessionRef.current !== session) { release(); return; }
        session.releaseCapture = release;
        stream.getAudioTracks().forEach(track => {
          track.onended = () => finish(session, '麦克风连接已中断，请检查设备后重试。');
        });
        clearTimeout(session.timer);
        session.timer = setTimeout(stop, 20000);
        setMessage('小 X 正在听。说完后点击「结束录音」，或停顿两秒自动结束。');
      } catch (error) { finish(session, microphoneError(error)); }
    })();
  }, [finish, stop]);

  const cancel = useCallback(() => {
    const session = sessionRef.current;
    if (session) finish(session, '语音输入已取消。');
  }, [finish]);

  useEffect(() => () => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session) { releaseAudio(session); session.request?.abort(); session.chunks = []; }
  }, []);

  return { supported, listening, processing, level, interim: '', message, engineNotice, start, stop, cancel };
}
