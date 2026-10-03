import { useEffect, useRef, useState } from 'react';
import type { Evidence, Step } from './api/consumer';
import { WorkBuddyConnection } from './WorkBuddyConnection';
import './xiaox-enterprise-agent.css';

type Connection = {
  provider: 'workbuddy'; configured: boolean; configurable: boolean; app_configured?: boolean;
  status: string; message?: string; active_registry_provider?: string;
};
type QueryResult = {
  provider: 'workbuddy'; company_name: string; matched_company_name: string | null;
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
        if (value.provider !== 'workbuddy' || typeof value.configured !== 'boolean') throw new Error();
        if (!controller.signal.aborted) setConnection(value);
      } catch {
        if (!controller.signal.aborted) { setConnection(null); setStatusError('暂时无法读取 WorkBuddy 连接状态，请重试。'); }
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
      if (value.provider !== 'workbuddy' || value.company_name !== name || !Array.isArray(value.sources)) throw new Error();
      if (!controller.signal.aborted && activeQuery.current === controller) setResult(value);
    } catch {
      if (!controller.signal.aborted && activeQuery.current === controller) setQueryError('本次 WorkBuddy 查询未完成，请稍后重试。');
    } finally {
      if (!controller.signal.aborted && activeQuery.current === controller) { setBusy(false); activeQuery.current = null; }
    }
  }

  function stopWaiting() {
    activeQuery.current?.abort(); activeQuery.current = null; setBusy(false);
    setQueryError('已停止等待。WorkBuddy 已收到的任务可能仍在执行。');
  }

  return <section className="jw-companion-voice jw-companion-enterprise-panel" aria-labelledby="jw-enterprise-title" onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
  }}>
    <div className="jw-voice-heading"><h2 id="jw-enterprise-title">WorkBuddy 企业查询</h2><button type="button" onClick={onClose} aria-label="关闭 WorkBuddy 企业查询">×</button></div>
    {checking && <p className="jw-voice-status" role="status">正在读取连接状态…</p>}
    {statusError && <div><p className="jw-voice-notice" role="alert">{statusError}</p><button type="button" className="jw-enterprise-secondary" onClick={() => setRevision(value => value + 1)}>重试连接状态</button></div>}
    {connection && <>
      <div className="jw-enterprise-connection"><WorkBuddyConnection standalone session={connection} onChange={value => {
        setConnection(current => ({ ...current, ...value, provider: 'workbuddy' }));
        setResult(null); setRevision(value => value + 1);
      }}/></div>
      {connection.active_registry_provider === 'qcc_mcp' && <p className="jw-enterprise-scope">当前查证使用企查查 MCP；这里单独调用 WorkBuddy 的企业查询连接器。</p>}
      {name ? <p className="jw-enterprise-company">已确认的企业<strong>{name}</strong></p> : <p className="jw-enterprise-scope">先在查证流程中确认完整公司名称，再查询企业资料。<a href="/investigations/new">去确认企业 ↗</a></p>}
      <button type="button" className="jw-voice-apply" disabled={!connection.configured || !name || busy || checking} onClick={() => void query()}>{busy ? '等待 WorkBuddy 返回…' : '查询企业资料'}</button>
      {busy && <><p role="status" className="jw-voice-status">正在通过 WorkBuddy 调用企查查连接器，请保持本地助理在线。</p><button type="button" className="jw-enterprise-secondary" onClick={stopWaiting}>停止等待</button></>}
    </>}
    {queryError && <p role="alert" className="jw-voice-notice">{queryError}</p>}
    {result && <div className="jw-enterprise-result">
      <p role="status" className="jw-voice-status">{result.message}</p>
      {result.sources.length > 0 && <><p className="jw-enterprise-scope">以下为本次 WorkBuddy 回传字段，未独立在线复验。</p>
        {result.sources.slice(0, 6).map(source => <details key={source.id}>
          <summary>{source.title}</summary><small>{source.publisher}</small><p>{source.excerpt}</p><small>{source.page_status}</small>
          {publicLink(source.url) && <a href={publicLink(source.url)} target="_blank" rel="noreferrer">查看来源说明 ↗</a>}
        </details>)}
        {result.sources.length > 6 && <p className="jw-enterprise-scope">本次共返回 {result.sources.length} 段资料，这里展示前 6 段。</p>}
      </>}
    </div>}
  </section>;
}
