import { useEffect, useMemo, useRef, useState } from 'react';
import type { Evidence, RiskAnalysis } from './api/consumer';
import './jianwei-search-tools.css';

type Place = { id: string; name: string; address: string; city: string; district: string; marker_url: string; relationship_status: string };
type PlaceCapability = { configured: boolean; message: string };
type Props = { onSelectPlace: (name: string, address: string) => void; report?: RiskAnalysis };

async function request<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch('/api/place-search/' + path, { signal, cache: 'no-store' });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(data?.message || data?.detail?.message || '地点查询暂时不可用。');
  return data;
}

export function JianweiSearchTools({ onSelectPlace, report }: Props) {
  const [capability, setCapability] = useState<PlaceCapability | null>(null);
  const [keyword, setKeyword] = useState('');
  const [city, setCity] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    const stop = new AbortController();
    request<PlaceCapability>('capabilities', stop.signal).then(setCapability).catch(() => {
      if (!stop.signal.aborted) setCapability({ configured: false, message: '地点查询暂时不可用，仍可直接填写门店名称和地址。' });
    });
    return () => { stop.abort(); generation.current++; controller.current?.abort(); };
  }, []);
  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (!capability?.configured || keyword.trim().length < 2) return;
    controller.current?.abort();
    const token = ++generation.current;
    const stop = new AbortController(); controller.current = stop;
    setBusy(true); setPlaces([]); setStatus('');
    try {
      const result = await request<{ places: Place[] }>('places?' + new URLSearchParams({ keyword: keyword.trim(), city: city.trim() }), AbortSignal.any([stop.signal, AbortSignal.timeout(16000)]));
      if (token !== generation.current) return;
      setPlaces(result.places);
      setStatus(result.places.length ? `找到 ${result.places.length} 个地点，请选择你实际前往的门店。` : '本次没有找到地点。可调整城市、关键词，或直接填写门店地址。');
    } catch (error) {
      if (token === generation.current && !stop.signal.aborted) setStatus(error instanceof Error && error.name !== 'TimeoutError' ? error.message : '地点查询超时，请稍后重试。');
    } finally { if (token === generation.current) setBusy(false); }
  }
  return <div className="jw-search-tools">
    {capability?.configured && <details className="jw-search-tool">
      <summary><span>找不到准确地址？</span><b>从地图选门店 ↗</b></summary>
      <div className="jw-search-tool-body">
        <p>{capability?.message || '正在检查地点查询服务…'}</p>
        {capability?.configured && <form onSubmit={search} className="jw-place-form">
          <label>门店 / 品牌<input value={keyword} onChange={event => setKeyword(event.target.value)} required minLength={2} maxLength={80} placeholder="门店或品牌名称"/></label>
          <label>城市<input value={city} onChange={event => setCity(event.target.value)} maxLength={40} placeholder="例如：杭州市"/></label>
          <button type="submit" disabled={busy || keyword.trim().length < 2}>{busy ? '查找中…' : '查找地点'}</button>
        </form>}
        {status && <p role="status">{status}</p>}
        <div className="jw-place-results">{places.map(place => <article key={place.id}>
          <strong>{place.name}</strong><p>{place.address || '地址未返回'}</p>
          <small>高德地图 · {place.relationship_status}</small>
          <div><button type="button" onClick={() => { onSelectPlace(place.name, place.address); setStatus(`已填入 ${place.name}。请继续查找并确认经营主体。`); }}>使用这家门店 →</button>
          {place.marker_url && <a href={place.marker_url} target="_blank" rel="noreferrer">在地图查看 ↗</a>}</div>
        </article>)}</div>
      </div>
    </details>}
    {report && <JianweiEvidenceFinder report={report}/>}
  </div>;
}

/** Literal evidence lookup: never generates a company conclusion from an unanswered question. */
export function findReportEvidence(sources: Evidence[], query: string) {
  const value = query.toLocaleLowerCase().trim();
  if (!value) return [];
  const tokens = value.split(/[\s，。！？?、；,;]+/).filter(Boolean);
  return sources.map(source => {
    const text = `${source.title} ${source.excerpt} ${source.publisher}`.toLocaleLowerCase();
    return { source, score: tokens.filter(token => text.includes(token)).length };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 8).map(item => item.source);
}

export function JianweiEvidenceFinder({ report }: { report: RiskAnalysis }) {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  useEffect(() => { setQuery(''); setSubmitted(''); }, [report.analysis_id]);
  const results = useMemo(() => findReportEvidence(report.sources, submitted), [report.sources, submitted]);
  const safeURL = (url: string) => /^https?:\/\//i.test(url) ? url : undefined;
  return <details className="jw-search-tool jw-evidence-finder">
    <summary><span>继续核对这份报告</span><b>查找证据 ↗</b></summary>
    <div className="jw-search-tool-body">
      <JianweiEvidenceQuestion report={report}/>
      <p>只检索「{report.identity.name}」本次报告已取得的资料。输入退款、变更、年报等关键词，查看对应原文。</p>
      <form className="jw-evidence-find-form" onSubmit={event => { event.preventDefault(); setSubmitted(query.trim()); }}><label>证据关键词<input value={query} onChange={event => setQuery(event.target.value)} maxLength={100} placeholder="例如：退款 变更"/></label><button disabled={!query.trim()}>查找出处</button></form>
      {submitted && <p role="status">{results.length ? `找到 ${results.length} 条相关材料；以下是来源原文，不是新的风险结论。` : '本次资料没有匹配的原文；不能据此认定没有相关问题。'}</p>}
      {results.map(source => <article className="jw-evidence-match" key={source.id}><strong>{source.title}</strong><blockquote>{source.excerpt}</blockquote><small>{source.publisher} · {source.published_at || '公开日期未标明'} · {source.page_status}</small>{safeURL(source.url) && <a href={safeURL(source.url)} target="_blank" rel="noreferrer">查看来源 ↗</a>}</article>)}
    </div>
  </details>;
}

type EvidenceAnswer = { answerable: boolean; answer: string; citations: { source_id: string; quote: string }[]; scope: string };

export function JianweiEvidenceQuestion({ report }: { report: RiskAnalysis }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<EvidenceAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    setQuestion(''); setAnswer(null); setError(''); setBusy(false);
    generation.current++;
    return () => { generation.current++; controller.current?.abort(); };
  }, [report.analysis_id]);
  async function ask(event: React.FormEvent) {
    event.preventDefault();
    if (busy || question.trim().length < 2 || !report.sources.length) return;
    const token = ++generation.current;
    controller.current?.abort();
    const stop = new AbortController(); controller.current = stop;
    setBusy(true); setAnswer(null); setError('');
    // The server revalidates all bounds and citations; these excerpts are context, not trusted facts.
    const preferred = findReportEvidence(report.sources, question);
    const sources = [...new Map([...preferred, ...report.sources].map(source => [source.id, source])).values()]
      .filter(source => source.excerpt.trim()).slice(0, 12)
      .map(source => ({ id: source.id, title: source.title.slice(0, 240), excerpt: source.excerpt.slice(0, 900), verification_status: source.verification_status }));
    try {
      const response = await fetch('/api/place-search/evidence-question', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: report.identity.name.slice(0, 100), question: question.trim(), sources }),
        signal: AbortSignal.any([stop.signal, AbortSignal.timeout(40000)]) });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result) throw new Error(result?.message || result?.detail?.message || '问答暂时不可用，未生成回答。');
      if (generation.current !== token) return;
      setAnswer(result as EvidenceAnswer);
    } catch (cause) {
      if (generation.current === token && !stop.signal.aborted) setError(cause instanceof Error && cause.name !== 'TimeoutError' ? cause.message : '问答超时，未生成回答。你仍可直接查看原文。');
    } finally { if (generation.current === token) setBusy(false); }
  }
  return <section className="jw-evidence-question" aria-label="报告问答">
    <h3>Ask X-Ray · 问问这份报告</h3>
    <p>根据本次报告的有限摘录解释问题，并列出原文引用；不会重新联网，也不会改变资料的核验等级。</p>
    <form className="jw-evidence-find-form" onSubmit={ask}>
      <label>关于这份报告的问题<textarea value={question} onChange={event => setQuestion(event.target.value)} maxLength={400} rows={2} placeholder="例如：材料里提到的退款问题，还有哪些没确认？" disabled={busy}/></label>
      <button disabled={busy || question.trim().length < 2 || !report.sources.length}>{busy ? '正在阅读摘录…' : '根据报告回答'}</button>
    </form>
    {!report.sources.length && <p>当前报告没有可引用的来源原文，暂时无法回答。</p>}
    {error && <p role="alert">{error}</p>}
    {answer && <div className="jw-evidence-answer" role="status">
      <p>{answer.answer}</p>
      {answer.citations.map((citation, index) => {
        const source = report.sources.find(item => item.id === citation.source_id);
        return source ? <blockquote key={`${citation.source_id}-${index}`}><p>{citation.quote}</p><cite>{source.title}</cite>{/^https?:\/\//i.test(source.url) && <a href={source.url} target="_blank" rel="noreferrer">查看原文 ↗</a>}</blockquote> : null;
      })}
      <small>{answer.scope} 本次最多纳入 12 条资料摘录；请结合完整原文核对。</small>
    </div>}
  </section>;
}
