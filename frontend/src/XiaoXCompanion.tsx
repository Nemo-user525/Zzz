import { useEffect, useRef, useState } from 'react';
import { XiaoXMotion, type XiaoXActivity } from './XiaoXMotion';
import { useXiaoXVoice, type VoiceFields } from './useXiaoXVoice';
import { useDraggableCompanion } from './useDraggableCompanion';
import './xiaox-companion.css';

type CompanionProps = {
  activity: XiaoXActivity;
  routeKey: string;
  busy: boolean;
  onVoiceQuery: (fields: VoiceFields, reveal?: boolean) => boolean;
};

const activityLabels: Record<XiaoXActivity, string> = {
  idle: '按住拖动，点击查看语音查案提示',
  searching: '正在四处找线索…',
  thinking: '整理线索，认真想一想…',
  reviewing: '一起核对，是不是这家？',
  complete: '线索整理好了，一起看看',
  listening: '正在听，点击「结束录音」完成',
  attention: '遇到一点问题，一起看看',
};

export function XiaoXCompanion({ activity, routeKey, busy, onVoiceQuery }: CompanionProps) {
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [recordingStarted, setRecordingStarted] = useState(false);
  const drag = useDraggableCompanion(voiceOpen);
  const [draft, setDraft] = useState<string | null>(null);
  const [draftLocation, setDraftLocation] = useState('');
  const [filled, setFilled] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [applyError, setApplyError] = useState('');
  const dogButton = useRef<HTMLButtonElement>(null);
  const recordButton = useRef<HTMLButtonElement>(null);
  const voice = useXiaoXVoice((text, fields) => {
    setTranscript(text); setApplyError('');
    const usable = fields && !fields.needs_clarification && fields.query.trim().length >= 2;
    setDraft(usable ? fields.query : ''); setDraftLocation(fields?.location || '');
    setFilled(Boolean(usable && !busy && onVoiceQuery(fields)));
  });
  const { cancel } = voice;
  const shownActivity = voice.listening ? 'listening' : voice.processing ? 'thinking' : activity;

  useEffect(() => {
    cancel(); setVoiceOpen(false); setRecordingStarted(false); setDraft(null); setApplyError(''); setFilled(false); setTranscript('');
  }, [routeKey, cancel]);

  useEffect(() => {
    if (voiceOpen) recordButton.current?.focus();
  }, [voiceOpen]);

  function closeVoice() {
    cancel(); setVoiceOpen(false); setRecordingStarted(false); setDraft(null); setApplyError('');
    dogButton.current?.focus();
  }
  function openVoice() {
    if (voiceOpen) return;
    setVoiceOpen(true); setRecordingStarted(false); setDraft(null); setApplyError(''); setFilled(false); setTranscript('');
  }
  function startRecording() {
    if (!voice.supported || voice.listening || voice.processing) return;
    setRecordingStarted(true); setDraft(null); setApplyError(''); setFilled(false); setTranscript('');
    voice.start();
  }
  function applyVoice() {
    if (busy || voice.listening || voice.processing || draft === null || draft.trim().length < 2) return;
    if (onVoiceQuery({ query: draft.trim(), location: draftLocation, needs_clarification: false }, true)) {
      setFilled(true); setApplyError(''); setVoiceOpen(false);
    }
    else setApplyError('暂时无法填入。当前查证内容仍保留，请稍后再试。');
  }

  return <aside ref={drag.companionRef} style={drag.positionStyle} className={'jw-xiaox-companion' + (voiceOpen ? ' is-open' : '')} aria-label="小 X 常驻助手" data-activity={shownActivity} data-dragging={drag.dragging}>
    {voiceOpen && <section id="jw-companion-voice-panel" ref={drag.panelRef} style={drag.panelStyle} className="jw-companion-voice" aria-labelledby="jw-voice-title" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); closeVoice(); } }}>
      <div className="jw-voice-heading"><h2 id="jw-voice-title">说给小 X 听</h2><button type="button" onClick={closeVoice} aria-label="关闭语音输入">×</button></div>
      {!recordingStarted && <p className="jw-voice-guide">说出想查的门店、品牌或公司名称。<span>例如：「帮我查一下杭州的某某健身房」。</span></p>}
      <p className="jw-voice-status" role="status">{filled ? '名称已填入，点击下方按钮前往查询栏。' : !recordingStarted && voice.supported ? '点击「开始录音」后，小 X 才会听你说。' : voice.message}</p>
      {voice.listening && <div className="jw-voice-listening"><span className="jw-voice-wave" aria-hidden="true"><i/><i/><i/><i/><i/></span><span>说完后，点击「结束录音」</span></div>}
      {voice.processing && <p className="jw-voice-wait">正在转成文字，请稍等…</p>}
      <button ref={recordButton} type="button" className={'jw-voice-record' + (voice.listening ? ' is-recording' : '')} onClick={voice.listening ? voice.stop : startRecording} disabled={!voice.supported || voice.processing}>{voice.listening ? '结束录音' : voice.processing ? '正在识别…' : recordingStarted ? '重新录音' : '开始录音'}</button>
      {!voice.listening && !voice.processing && draft !== null && <div className="jw-voice-result">
        <p className="jw-voice-original">你说的是：{transcript}</p>
        <label htmlFor="jw-voice-draft">提取的门店或公司名称</label>
        <input id="jw-voice-draft" type="text" value={draft} maxLength={80} onChange={event => { setDraft(event.target.value); setFilled(false); }}/>
        {draftLocation && <p>位置：{draftLocation}</p>}
        <p>{busy ? '当前查证结束后，就可以填入新的名称。' : filled ? '查证由你点击开始，不会自动提交。' : '没有确定的关键词时，可以补充名称或重新说。'}</p>
        <button type="button" className="jw-voice-apply" onClick={applyVoice} disabled={busy || draft.trim().length < 2}>{filled ? '前往查询栏' : '填入查询栏'} <span aria-hidden="true">↗</span></button>
      </div>}
      {applyError && <p role="alert" className="jw-voice-notice">{applyError}</p>}
      {recordingStarted && voice.engineNotice && <p className="jw-voice-notice">{voice.engineNotice}</p>}
      {!voice.listening && !voice.processing && draft === null && (recordingStarted || !voice.supported) && <p className="jw-voice-retry">{voice.supported ? '点击「重新录音」，可以再说一次。' : '也可以直接在查询框输入文字。'}</p>}
      <p className="jw-voice-privacy">语音由本站识别，录音不保存。</p>
    </section>}
    <div className="jw-companion-body">
      <span id="jw-companion-gesture-hint" className="jw-companion-hint">{drag.dragging ? '松手放在这里' : voice.processing ? '正在识别语音…' : activityLabels[shownActivity]}{shownActivity !== 'idle' && !drag.dragging && <small>按住拖动，点击查看语音查案提示</small>}</span>
      <button type="button" ref={dogButton} className="jw-companion-dog" aria-label="打开小 X 语音查案提示" aria-describedby="jw-companion-gesture-hint" aria-expanded={voiceOpen} aria-controls={voiceOpen ? 'jw-companion-voice-panel' : undefined} {...drag.pointerHandlers} onDragStart={event => event.preventDefault()} onClick={event => { if (!drag.consumeDragClick(event)) openVoice(); }} title="按住拖动，点击查看语音查案提示">
        <XiaoXMotion activity={shownActivity}/>
        {voice.listening && <span className="jw-companion-recording" aria-hidden="true"/>}
      </button>
      <button type="button" className="jw-companion-voice-trigger" aria-label="语音查案" title="语音查案" aria-expanded={voiceOpen} aria-controls={voiceOpen ? 'jw-companion-voice-panel' : undefined} onClick={openVoice}><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="2" width="6" height="10" rx="3"/><path d="M4 9v1a6 6 0 0 0 12 0V9M10 16v2M7 18h6"/></svg></button>
    </div>
  </aside>;
}

