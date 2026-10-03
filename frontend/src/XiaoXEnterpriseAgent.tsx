import { useEffect, useRef, useState } from 'react';
import type { Evidence, Step } from './api/consumer';
import './xiaox-enterprise-agent.css';

type Provider = 'workbuddy' | 'qcc_mcp';
type Connection = { provider: Provider; configured: boolean };
type QueryResult = {
  provider: Provider; company_name: string; matched_company_name: string | null;
  status: string; message: string; sources: Evidence[]; step: Step;
};

function publicLink(value: string) {
  try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? url.href : undefined; }
  catch { return undefined; }
}

export function XiaoXEnterpriseAgent({ companyName, onClose, onBusyChange }: {
  companyName?: string; onClose: () => void; onBusyChange?: (busy: boolean) => void;
}) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [checking, setChecking] = useState(true);
  const [statusError, setStatusError] = useState('');
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [queryError, setQueryError] = useState('');
  const activeQuery = useRef<AbortController | null>(null);
  const name = companyName?.trim() || '';

  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);

  useEffect(() => {
    const controller = new AbortController();
    setChecking(true); setStatusError('');
    void (async () => {
      try {
        const response = await fetch('/api/consumer/enterprise-agent/status', { signal: controller.signal });
        if (!response.ok) throw new Error();
        const value = await response.json() as Connection;
        if (!['workbuddy', 'qcc_mcp'].includes(value.provider) || typeof value.configured !== 'boolean') throw new Error();
        if (!controller.signal.aborted) setConnection(value);
      } catch {
        if (!controller.signal.aborted) { setConnection(null); setStatusError('企业资料查询暂时不可用，请稍后再试。'); }
      } finally { if (!controller.signal.aborted) setChecking(false); }
    })();
    return () => controller.abort();
  }, [revision]);

  useEffect(() => {
    setResult(null); setQueryError(''); setBusy(false);
    return () => { activeQuery.current?.abort(); activeQuery.current = null; };
  }, [name]);

  async function query() {
    if (!name || !connection?.configured || busy || checking) return;
    const controller = new AbortController();
    activeQuery.current?.abort(); activeQuery.current = controller;
    setBusy(true); setQueryError(''); setResult(null);
    try {
      const response = await fetch('/api/consumer/enterprise-agent/query', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ company_name: name, identity_confirmed: true }),
      });
      if (!response.ok) throw new Error();
      const value = await response.json() as QueryResult;
      if (value.provider !== connection.provider || value.company_name !== name || !Array.isArray(value.sources)) throw new Error();
      if (!controller.signal.aborted && activeQuery.current === controller) setResult(value);
    } catch {
      if (!controller.signal.aborted && activeQuery.current === controller) setQueryError('本次查询未完成，请稍后重试。');
    } finally {
      if (!controller.signal.aborted && activeQuery.current === controller) { setBusy(false); activeQuery.current = null; }
    }
  }

  function stopWaiting() {
    activeQuery.current?.abort(); activeQuery.current = null; setBusy(false);
    setQueryError('已停止等待，本次查询可能仍在处理。');
  }

  return <section className="jw-companion-voice jw-companion-enterprise-panel" aria-labelledby="jw-enterprise-title" onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
  }}>
    <div className="jw-voice-heading"><h2 id="jw-enterprise-title">小 X · 企业查询</h2><button type="button" onClick={onClose} aria-label="关闭企业查询">×</button></div>
    {!name ? <>
      <p className="jw-voice-status">告诉我你想了解的门店、品牌或公司。</p>
      <p className="jw-enterprise-scope">我们先找到它背后的经营主体，再一起核对资料。也可以点小狗，直接说给我听。</p>
      <a className="jw-voice-apply jw-enterprise-start" href="/investigations/new">开始查证 <span aria-hidden="true">↗</span></a>
    </> : <>
      <p className="jw-enterprise-company">已确认的企业<strong>{name}</strong></p>
      {checking && <p className="jw-voice-status" role="status">正在准备查询…</p>}
      {!checking && (statusError || (connection && !connection.configured)) && <>
        <p className="jw-voice-notice" role="status">企业资料查询暂时不可用，请稍后再试。已有的查证内容仍会保留。</p>
        <button type="button" className="jw-enterprise-secondary" onClick={() => setRevision(value => value + 1)}>重新尝试</button>
        <button type="button" className="jw-voice-apply" onClick={onClose}>继续查看查证内容</button>
      </>}
      {connection?.configured && <>
        <button type="button" className="jw-voice-apply" disabled={busy || checking} onClick={() => void query()}>{busy ? '正在查询…' : '查询企业资料'}</button>
        {busy && <><p role="status" className="jw-voice-status">正在查找这家企业的资料，请稍等…</p><button type="button" className="jw-enterprise-secondary" onClick={stopWaiting}>停止等待</button></>}
      </>}
    </>}
    {queryError && <p role="alert" className="jw-voice-notice">{queryError}</p>}
    {result && <div className="jw-enterprise-result">
      <p role="status" className="jw-voice-status">{result.status === 'completed'
        ? result.sources.length ? '已找到这家企业的相关资料。' : '本次未找到可展示的企业资料。'
        : '本次企业资料查询未完成，请稍后重试。'}</p>
      {result.sources.length > 0 && <><p className="jw-enterprise-scope">以下资料由企业信息来源返回，尚未独立核验。</p>
        {result.sources.slice(0, 6).map(source => <details key={source.id}>
          <summary>{source.title}</summary><small>{source.publisher}</small><p>{source.excerpt}</p><small>{source.page_status}</small>
          {publicLink(source.url) && <a href={publicLink(source.url)} target="_blank" rel="noreferrer">查看来源说明 ↗</a>}
        </details>)}
        {result.sources.length > 6 && <p className="jw-enterprise-scope">本次共返回 {result.sources.length} 段资料，这里展示前 6 段。</p>}
      </>}
    </div>}
  </section>;
}
