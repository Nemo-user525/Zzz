import { useEffect, useRef, useState } from 'react';
import { XiaoXMotion, type XiaoXActivity } from './XiaoXMotion';
import { useXiaoXVoice, type VoiceFields } from './useXiaoXVoice';
import { XiaoXEnterpriseAgent } from './XiaoXEnterpriseAgent';
import './xiaox-companion.css';

type CompanionProps = {
  activity: XiaoXActivity;
  routeKey: string;
  busy: boolean;
  dancing: boolean;
  onDance: () => void;
  onVoiceQuery: (fields: VoiceFields) => boolean;
  companyName?: string;
};

const activityLabels: Record<XiaoXActivity, string> = {
  idle: '点我，说给小 X 听',
  searching: '正在四处找线索…',
  thinking: '整理线索，认真想一想…',
  reviewing: '一起核对，是不是这家？',
  complete: '线索整理好了，一起看看',
  listening: '再点我，就说好了',
  dancing: '跳个小舞，陪你等一会儿',
  attention: '遇到一点问题，一起看看',
};

export function XiaoXCompanion({ activity, routeKey, busy, dancing, onDance, onVoiceQuery, companyName }: CompanionProps) {
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [enterpriseOpen, setEnterpriseOpen] = useState(false);
  const [enterpriseBusy, setEnterpriseBusy] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [draftLocation, setDraftLocation] = useState('');
  const [filled, setFilled] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [applyError, setApplyError] = useState('');
  const dogButton = useRef<HTMLButtonElement>(null);
  const voice = useXiaoXVoice((text, fields) => {
    setTranscript(text); setApplyError('');
    const usable = fields && !fields.needs_clarification && fields.query.trim().length >= 2;
    setDraft(usable ? fields.query : ''); setDraftLocation(fields?.location || '');
    setFilled(Boolean(usable && !busy && onVoiceQuery(fields)));
  });
  const { cancel } = voice;
  const shownActivity = voice.listening ? 'listening' : voice.processing || enterpriseBusy ? 'thinking' : dancing ? 'dancing' : activity;

  useEffect(() => {
    cancel(); setVoiceOpen(false); setEnterpriseOpen(false); setDraft(null); setApplyError(''); setFilled(false); setTranscript('');
  }, [routeKey, cancel]);

  function closeVoice() {
    cancel(); setVoiceOpen(false); setDraft(null); setApplyError('');
    dogButton.current?.focus();
  }
  function toggleVoice() {
    if (voice.processing) return;
    if (voice.listening) { voice.stop(); return; }
    if (dancing) onDance();
    setEnterpriseOpen(false); setVoiceOpen(true); setDraft(null); setApplyError(''); setFilled(false); setTranscript('');
    voice.start();
  }
  function applyVoice() {
    if (busy || voice.listening || voice.processing || draft === null || draft.trim().length < 2) return;
    if (onVoiceQuery({ query: draft.trim(), location: draftLocation, needs_clarification: false })) { setFilled(true); setApplyError(''); }
    else setApplyError('暂时无法填入。当前查证内容仍保留，请稍后再试。');
  }

  return <aside className={'jw-xiaox-companion' + (voiceOpen ? ' is-open' : '')} aria-label="小 X 常驻助手" data-activity={shownActivity}>
    {enterpriseOpen && <XiaoXEnterpriseAgent companyName={companyName} onBusyChange={setEnterpriseBusy} onClose={() => { setEnterpriseOpen(false); dogButton.current?.focus(); }}/>}
    {voiceOpen && <section className="jw-companion-voice" aria-labelledby="jw-voice-title" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); closeVoice(); } }}>
      <div className="jw-voice-heading"><h2 id="jw-voice-title">说给小 X 听</h2><button type="button" onClick={closeVoice} aria-label="关闭语音输入">×</button></div>
      <p className="jw-voice-status" role="status">{filled ? '已自动填入查询栏，可以直接修改。' : voice.message || '正在开启麦克风…'}</p>
      {voice.listening && <div className="jw-voice-listening"><span className="jw-voice-wave" aria-hidden="true"><i/><i/><i/><i/><i/></span><span>说完后，再点一下小狗</span></div>}
      {voice.processing && <p className="jw-voice-wait">正在转成文字，请稍等…</p>}
      {!voice.listening && !voice.processing && draft !== null && <div className="jw-voice-result">
        <p className="jw-voice-original">你说的是：{transcript}</p>
        <label htmlFor="jw-voice-draft">提取的门店或公司名称</label>
        <textarea id="jw-voice-draft" value={draft} maxLength={80} rows={2} onChange={event => { setDraft(event.target.value); setFilled(false); }}/>
        {draftLocation && <p>位置：{draftLocation}</p>}
        <p>{busy ? '当前查证结束后，就可以填入新的名称。' : filled ? '查证由你点击开始，不会自动提交。' : '没有确定的关键词时，可以补充名称或重新说。'}</p>
        {!filled && <button type="button" className="jw-voice-apply" onClick={applyVoice} disabled={busy || draft.trim().length < 2}>填入查询栏 <span aria-hidden="true">↗</span></button>}
      </div>}
      {applyError && <p role="alert" className="jw-voice-notice">{applyError}</p>}
      {!voice.listening && !voice.processing && draft === null && <p className="jw-voice-retry">{voice.supported ? '点一下小狗，可以重新说。' : '也可以直接在查询框输入文字。'}</p>}
      <p className="jw-voice-privacy">语音由本站识别，录音不保存。</p>
    </section>}
    <div className="jw-companion-body">
      <span className="jw-companion-hint" aria-hidden="true">{voice.processing ? '正在识别语音…' : activityLabels[shownActivity]}</span>
      <button type="button" ref={dogButton} className="jw-companion-dog" aria-label={voice.listening ? '点击小 X，结束录音' : voice.processing ? '小 X 正在识别语音' : '点击小 X，开始语音识别'} aria-pressed={voice.listening} aria-expanded={voiceOpen} aria-controls={voiceOpen ? 'jw-voice-title' : undefined} disabled={voice.processing} onClick={toggleVoice} title={voice.listening ? '说好了？再点一下我' : '点我，直接说出门店、品牌或公司名称'}>
        <XiaoXMotion activity={shownActivity}/>
        {dancing && !voice.listening && <span className="jw-companion-notes" aria-hidden="true">♪ ♫</span>}
        {voice.listening && <span className="jw-companion-recording" aria-hidden="true"/>}
      </button>
      <button type="button" className="jw-companion-dance" aria-label={dancing ? '停止小 X 跳舞' : '让小 X 跳舞'} aria-pressed={dancing} onClick={onDance} disabled={voice.listening || voice.processing} title="跳个小舞">♫</button>
      <button type="button" className="jw-companion-enterprise" aria-label="WorkBuddy 企业查询" aria-expanded={enterpriseOpen} disabled={voice.listening || voice.processing} onClick={() => { setVoiceOpen(false); setEnterpriseOpen(value => !value); }} title="WorkBuddy 企业查询">↗</button>
    </div>
  </aside>;
}

