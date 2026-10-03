import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { consumerApi, type Capabilities, type Conditions, type Evidence } from './api/consumer';
import { Drawer } from './Drawer';
import { JianweiHeader, JianweiHero, JianweiIntro, JianweiHomeClosing, JianweiFooter } from './JianweiLanding';
import { JianweiFanRain } from './JianweiFanRain';
import { JianweiMethodPage, JianweiStoryPage, JianweiExample } from './JianweiPages';
import { JianweiVerificationReport } from './JianweiVerificationReport';
import { XiaoXAgent } from './XiaoXAgent';
import { XiaoXCompanion } from './XiaoXCompanion';
import type { VoiceFields } from './useXiaoXVoice';
import type { XiaoXActivity } from './XiaoXMotion';
import { QccSession } from './QccSession';
import { JianweiSearchTools } from './JianweiSearchTools';
import { emptyVerification, readVerification, verificationStorageKey, formatTime, sourceLabel, sourceUrl, type VerificationSnapshot } from './jianweiVerification';
import './consumer.css';
import './jianwei-flow.css';

const previousStorageKey = 'jianwei-previous-verification-v1';
const documentRoutes = ['/method', '/story', '/examples/gym-card'];
const stepLabels = ['输入信息', '核对主体', '查看证据', '核对卡'];
type ReturnPoint = { url: string; scrollY: number };

function savedRecord(): VerificationSnapshot | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(previousStorageKey) || 'null');
    return saved && typeof saved.query === 'string' && typeof saved.location === 'string' && saved.conditions ? saved : null;
  } catch { return null; }
}
function recordPath(value: VerificationSnapshot) {
  if (!value.discovery) return '/investigations/new';
  const id = encodeURIComponent(value.discovery.investigation_id);
  return '/investigations/' + id + '/' + (value.identityUnconfirmed || value.report ? 'evidence' : 'identity');
}
function safeReturnPoint(): ReturnPoint {
  const point = window.history.state?.jwReturn;
  if (point && typeof point.url === 'string' && /^\/(?:$|#|investigations\/)/.test(point.url) && !point.url.startsWith('//')) {
    return { url: point.url, scrollY: Number.isFinite(point.scrollY) ? point.scrollY : 0 };
  }
  return { url: '/', scrollY: 0 };
}

export function ConsumerWorkspace() {
  const [snapshot, setSnapshot] = useState(readVerification);
  const [previous, setPrevious] = useState(savedRecord);
  const [path, setPath] = useState(window.location.pathname);
  const [returnPoint, setReturnPoint] = useState(safeReturnPoint);
  const [cap, setCap] = useState<Capabilities | null>(null);
  const [pending, setPending] = useState<'search' | 'analyse' | null>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [storageError, setStorageError] = useState(false);
  const [detail, setDetail] = useState<Evidence[] | null>(null);
  const [dancing, setDancing] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState('');
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const seq = useRef(0), controller = useRef<AbortController | null>(null);
  const { query, location, conditions, discovery, selected, confirmation } = snapshot;
  const home = path === '/', isDocument = documentRoutes.includes(path), workflow = !home && !isDocument;
  const step = path.endsWith('/identity') ? 1 : path.endsWith('/evidence') ? 2 : path.endsWith('/report') ? 3 : 0;
  const routeId = path.match(/^\/investigations\/([^/]+)\/(identity|evidence|report)$/)?.[1];
  const matchesRecord = !!discovery && (!routeId || routeId === encodeURIComponent(discovery.investigation_id));
  const evidenceReady = matchesRecord && (snapshot.identityUnconfirmed || !!snapshot.report);
  const xiaoxActivity: XiaoXActivity = error ? 'attention' : pending === 'search' ? 'searching' : pending === 'analyse' ? 'thinking' : step > 1 && evidenceReady ? 'complete' : step === 1 && matchesRecord ? 'reviewing' : 'idle';
  useEffect(() => {
    if (!dancing) return;
    const timer = window.setTimeout(() => setDancing(false), 8000);
    return () => window.clearTimeout(timer);
  }, [dancing]);
  function toggleDance() { setDancing(value => !value); }

  function cancel() { seq.current++; controller.current?.abort(); setPending(null); setProgress(''); }
  function update(change: Partial<VerificationSnapshot>, clearDiscovery = false) {
    cancel(); setError(''); setDetail(null);
    setSnapshot(value => ({ ...value, report: null, ...(clearDiscovery ? { discovery: null, selected: '', confirmation: '', identityUnconfirmed: false } : {}), ...change }));
  }
  function navigate(url: string, restoreY?: number) {
    const target = new URL(url, window.location.href);
    if (target.pathname === '/' && target.hash === '#investigate') { target.pathname = '/investigations/new'; target.hash = ''; }
    const current = window.location.pathname + window.location.search + window.location.hash;
    const existingState = window.history.state || {};
    window.history.replaceState({ ...existingState, jwScrollY: window.scrollY }, '', current);
    const nextReturn = documentRoutes.includes(target.pathname)
      ? (documentRoutes.includes(path) ? safeReturnPoint() : { url: current, scrollY: window.scrollY })
      : undefined;
    window.history.pushState({ ...(nextReturn ? { jwReturn: nextReturn } : {}), jwScrollY: restoreY || 0 }, '', target.pathname + target.search + target.hash);
    setPath(target.pathname); setReturnPoint(safeReturnPoint()); setDetail(null); setError('');
    requestAnimationFrame(() => {
      if (restoreY !== undefined) window.scrollTo?.({ top: restoreY, behavior: 'instant' });
      else if (target.hash) document.getElementById(target.hash.slice(1))?.scrollIntoView?.({ block: 'start' });
      else { window.scrollTo?.({ top: 0, behavior: 'instant' }); document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true }); }
    });
  }
  function routeTo(next: string, id = discovery?.investigation_id) { navigate('/investigations/' + encodeURIComponent(id || '') + '/' + next); }
  function onLink(event: MouseEvent<HTMLDivElement>) {
    const anchor = (event.target as HTMLElement).closest('a');
    if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || anchor.target || anchor.hasAttribute('download')) return;
    const url = new URL(anchor.href);
    if (url.origin !== window.location.origin || url.search.includes('view=') || !/^\/(?:$|story$|method$|examples\/gym-card$|investigations\/)/.test(url.pathname)) return;
    event.preventDefault(); cancel();
    navigate(url.href, anchor.hasAttribute('data-jw-return') ? returnPoint.scrollY : undefined);
  }
  useEffect(() => {
    try { sessionStorage.setItem(verificationStorageKey, JSON.stringify(snapshot)); setStorageError(false); }
    catch { setStorageError(true); }
  }, [snapshot]);
  useEffect(() => {
    const boot = new AbortController(); consumerApi.capabilities(boot.signal).then(setCap).catch(() => {});
    // Native fragment navigation can run before React has inserted the target.
    // Resolve it once after the first committed layout, independent of request/input updates.
    const initialUrl = window.location.href;
    const legacySearch = window.location.pathname === '/' && window.location.hash === '#investigate';
    if (legacySearch) { window.history.replaceState(window.history.state, '', '/investigations/new'); setPath('/investigations/new'); window.scrollTo?.({ top: 0, behavior: 'instant' }); }
    const initialHash = legacySearch ? '' : window.location.hash;
    const initialAnchorFrame = initialHash ? requestAnimationFrame(() => {
      if (window.location.href === initialUrl) document.getElementById(initialHash.slice(1))?.scrollIntoView?.({ block: 'start', behavior: 'instant' });
    }) : undefined;
    const pop = () => {
      cancel(); setPath(window.location.pathname); setReturnPoint(safeReturnPoint()); setDetail(null); setError('');
      const scroll = window.history.state?.jwScrollY;
      if (Number.isFinite(scroll)) requestAnimationFrame(() => window.scrollTo?.({ top: scroll, behavior: 'instant' }));
    };
    window.addEventListener('popstate', pop);
    return () => { boot.abort(); controller.current?.abort(); seq.current++; if (initialAnchorFrame !== undefined) cancelAnimationFrame(initialAnchorFrame); window.removeEventListener('popstate', pop); };
  }, []);
  async function search() {
    if (query.trim().length < 2) return;
    cancel(); const current = seq.current; setError('');
    setSnapshot(value => ({ ...value, discovery: null, selected: '', confirmation: '', report: null, identityUnconfirmed: false }));
    controller.current = new AbortController(); setPending('search');
    try {
      const value = await consumerApi.discover(query.trim(), location.trim(), controller.current.signal);
      if (seq.current === current) { setSnapshot(record => ({ ...record, discovery: value })); routeTo('identity', value.investigation_id); }
    } catch (e) { if (seq.current === current) setError(e instanceof Error ? e.message : '查询失败，请重试'); }
    finally { if (seq.current === current) setPending(null); }
  }
  async function analyse() {
    if (!discovery || !selected || !confirmation.trim()) return;
    cancel(); const current = seq.current; setError(''); controller.current = new AbortController(); setPending('analyse');
    try {
      const value = await consumerApi.analyse(discovery.investigation_id, selected, conditions, controller.current.signal, message => { if (seq.current === current) setProgress(message); });
      if (seq.current === current) { setSnapshot(record => ({ ...record, report: value, identityUnconfirmed: false })); routeTo('evidence'); }
    } catch (e) { if (seq.current === current) setError(e instanceof Error ? e.message : '读取资料失败，请重试'); }
    finally { if (seq.current === current) setPending(null); }
  }
  function condition<K extends keyof Conditions>(key: K, value: Conditions[K]) { update({ conditions: { ...conditions, [key]: value } }); }
  function acceptVoiceQuery(fields: VoiceFields) {
    const name = fields.query.trim().slice(0, 80);
    if (name.length < 2 || pending) return false;
    if (discovery) {
      try { sessionStorage.setItem(previousStorageKey, JSON.stringify(snapshot)); setPrevious(snapshot); }
      catch { return false; }
    }
    update({ query: name, ...(fields.location ? { location: fields.location.slice(0, 60) } : {}) }, true);
    setVoiceNotice('语音已自动填入：' + name + (fields.location ? ' · ' + fields.location : '') + '。可以修改后开始查证。');
    if (path !== '/investigations/new') navigate('/investigations/new');
    return true;
  }
  function startAnother() {
    try {
      sessionStorage.setItem(previousStorageKey, JSON.stringify(snapshot));
      setPrevious(snapshot); cancel(); setSnapshot({ ...emptyVerification, conditions: { ...emptyVerification.conditions } }); navigate('/investigations/new');
    } catch { setError('暂时无法保存当前查证，请先保存核对卡，再开始另一家'); }
  }
  function restorePrevious() {
    if (!previous) return;
    try {
      // Restore through the normal reader so saved data is validated again.
      sessionStorage.setItem(verificationStorageKey, JSON.stringify(previous));
      const restored = readVerification();
      if (snapshot.query.trim()) sessionStorage.setItem(previousStorageKey, JSON.stringify(snapshot));
      else sessionStorage.removeItem(previousStorageKey);
      setPrevious(snapshot.query.trim() ? snapshot : null); cancel(); setSnapshot(restored); navigate(recordPath(restored));
    } catch { setError('无法恢复上次查证。当前填写内容已保留。'); }
  }
  const pageTitles = ['先找到，你在意的那家店。', '确认查到的，是不是同一家。', '沿着来源，逐条看清线索。', '把下一步，要问的带走。'];
  const pageDescriptions = ['先填名字和位置。消费细节可以稍后补充。', '对照营业执照、合同抬头或收款方；没有依据时，也可以保留“未确认”。', '线索与事实分开看，每条材料都能回到原始出处。', '保存已知、未知和付款前的问题，便于向门店逐项核对。'];
  const queryForm = <form id="jw-search-form" className="consumer-panel consumer-search jw-query-form jw-focused-form" onSubmit={event => { event.preventDefault(); void search(); }}>
    <label>门店、品牌或公司名称<input required minLength={2} maxLength={80} autoComplete="organization" value={query} placeholder="输入你在意的那家店" onChange={event => update({ query: event.target.value }, true)}/></label>
    <label>城市／门店位置（选填）<input maxLength={60} autoComplete="street-address" value={location} placeholder="例如：杭州 西湖区，某路某号" onChange={event => update({ location: event.target.value }, true)}/><small>补充城市或地址，更容易分清同名门店。</small></label>
    <details className="jw-optional-fields"><summary>补充消费计划 <span>选填 · 用于整理核对问题</span></summary><div>
      <label>服务类型<select value={conditions.service_category} onChange={event => condition('service_category', event.target.value as Conditions['service_category'])}><option value="fitness">健身运动</option><option value="education">教育培训</option><option value="beauty">美容美发</option><option value="eldercare">养老服务</option><option value="other">其他服务</option></select></label>
      <label>消费意图<select value={conditions.intent} onChange={event => condition('intent', event.target.value as Conditions['intent'])}><option value="initial_purchase">首次办卡／购买课包</option><option value="top_up">追加充值／加购服务</option><option value="renewal">续费</option><option value="explore">先了解一下</option></select></label>
      <label>准备预付金额（元，选填）<input type="number" min="0" max="100000000" step="0.01" value={conditions.amount_yuan ?? ''} placeholder="可先不填" onChange={event => condition('amount_yuan', event.target.value === '' ? null : Number(event.target.value))}/></label>
      <label>预计服务时长（月，选填）<input type="number" min="1" max="120" step="1" value={conditions.service_duration_months ?? ''} placeholder="例如：12" onChange={event => condition('service_duration_months', event.target.value === '' ? null : Number(event.target.value))}/></label>
    </div></details>
    <div className="jw-agent-submit"><small>无需注册 · 下一步核对经营主体</small><button type="submit" className="consumer-primary" disabled={pending !== null || query.trim().length < 2}>{pending === 'search' ? '正在查找经营主体…' : '查找经营主体'}<span aria-hidden="true">↗</span></button></div>
  </form>;
  const searchFeedback = <>
    {voiceNotice && step === 0 && <p className="consumer-message" role="status">{voiceNotice}</p>}
    {storageError && <p role="status" className="consumer-message">浏览器无法保存本次草稿。刷新或关闭页面后，内容可能丢失；完成后请导出核对卡。</p>}
    {error && <div className="consumer-message jw-flow-error" role="alert"><strong>{error}</strong><p>当前填写内容已保留。可以重试，或返回输入补充门店位置。</p>{step > 0 && <button className="ghost" onClick={() => navigate('/investigations/new')}>返回修改输入</button>}</div>}
    {pending && <p className="consumer-message" role="status">{pending === 'search' ? '正在检索公开资料并识别候选主体。' : progress || '正在读取所选主体的资料，请稍候。'} <button className="ghost" onClick={cancel}>取消</button></p>}
  </>;

  return <div className={'app-shell consumer-shell jw-blueprint jw-has-companion' + (workflow ? ' jw-task-active' : '')} onClick={onLink}>
    <a className="jw-skip-link" href={workflow ? '#investigate' : '/investigations/new'}>直接进入查询</a>
    <JianweiHeader path={path}/>{home && <><JianweiFanRain/><main><JianweiHero/><JianweiIntro/><JianweiHomeClosing/></main><JianweiFooter/></>}
    {path === '/method' ? <JianweiMethodPage returnTo={returnPoint.url}/> : path === '/story' ? <JianweiStoryPage returnTo={returnPoint.url}/> : path === '/examples/gym-card' ? <JianweiExample returnTo={returnPoint.url}/> : home ? null :
      <main className="consumer-main jw-workflow-page" id="investigate">
        <div className="jw-flow-topline"><a href="/">← 返回首页</a><span>观察查 / {stepLabels[step]}</span><a href="/method">方法与边界 ↗</a></div>
        <nav className="jw-workflow-steps" aria-label="查证步骤">{stepLabels.map((label, index) => <button key={label} aria-current={step === index ? 'step' : undefined} disabled={index > 0 && !matchesRecord || index > 1 && !evidenceReady} onClick={() => { cancel(); index === 0 ? navigate('/investigations/new') : routeTo(['', 'identity', 'evidence', 'report'][index]); }}><span>0{index + 1}</span>{label}</button>)}</nav>
        {step > 0 && <header className="jw-flow-heading"><p className="jw-overline">STEP 0{step + 1} / 04</p><h1 tabIndex={-1}>{pageTitles[step]}</h1><p>{pageDescriptions[step]}</p>{matchesRecord && <div className="jw-query-context"><strong>{query}</strong><span>{location || '位置未提供'}</span><button onClick={() => { cancel(); navigate('/investigations/new'); }}>修改输入</button></div>}</header>}
        {step === 0 && <>
          {previous && <div className="jw-previous-record"><p>上次查证已保留：<strong>{previous.query}</strong></p><button className="ghost" onClick={restorePrevious}>返回上次查证</button></div>}
          <XiaoXAgent standalone busy={pending === 'search'} query={query} feedback={searchFeedback}>{queryForm}</XiaoXAgent>
          <JianweiSearchTools onSelectPlace={(name, address) => update({ query: name.slice(0, 80), location: address.slice(0, 60) }, true)}/>
          <nav className="jw-research-tools" aria-label="更多调查工具"><span>继续深入调查</span><a href="/?view=company">企业档案、财报与四维分析 ↗</a><a href="/?view=trade">现金流情景推演 ↗</a></nav>
        </>}
        {step > 0 && searchFeedback}
        {step > 0 && !matchesRecord && <section className="consumer-panel jw-empty-state"><h2>当前标签页没有这份查证记录</h2><p>这条链接没有对应的本地记录。你已填写的内容会保留，可以返回继续。</p><a className="consumer-primary" href="/investigations/new">返回输入 →</a></section>}
        {step === 1 && matchesRecord && discovery && <section className="consumer-panel jw-identity">
          <div className="jw-identity-title"><h2>候选经营主体</h2><small>检索于 {formatTime(discovery.generated_at)}</small></div>
          <p>候选只说明来源提及过该公司，品牌、总部与分店不能自动等同。</p>
          {discovery.mode === 'cached' && <p className="consumer-message">历史缓存：本次查询失败，以下是此前取得的资料。</p>}
          {discovery.mode === 'unavailable' && <div className="consumer-message" role="alert"><strong>公开查询暂不可用</strong><p>可以回到输入页重试；如果继续，只会显示已取得的资料和当前缺口。</p></div>}
          {!discovery.candidates.length && <div className="jw-empty-state"><h3>本次没有找到可确认的经营主体</h3><p>建议补充门店地址或完整公司名。也可以保留“主体未确认”，继续查看已有线索。</p><button className="ghost" onClick={() => navigate('/investigations/new')}>补充地址或公司全称</button></div>}
          <div className="consumer-candidates">{discovery.candidates.map(candidate => <article key={candidate.id} className={selected === candidate.id ? 'is-selected' : ''}>
            <label><input type="radio" name="candidate" checked={selected === candidate.id} onChange={() => update({ selected: candidate.id, confirmation: '', identityUnconfirmed: false })}/><strong>{candidate.name}</strong></label><p>{candidate.basis}</p><small>{candidate.relationship_status}</small><button className="ghost" disabled={!candidate.source_ids.some(id => discovery.sources.some(source => source.id === id))} onClick={() => setDetail(discovery.sources.filter(source => candidate.source_ids.includes(source.id)))}>匹配依据</button>
          </article>)}</div>
          {selected && <form id="jw-identity-form" className="jw-confirmation" onSubmit={event => { event.preventDefault(); void analyse(); }}><label>你核对主体的依据<input required maxLength={300} value={confirmation} placeholder="例如：门店营业执照上的名称与候选一致" onChange={event => update({ confirmation: event.target.value })}/></label><p>这会记录为用户确认；不会标记为来源已核验。</p></form>}
        </section>}
        {step > 1 && evidenceReady && <JianweiVerificationReport snapshot={snapshot} showSources={setDetail} report={step === 3} toReport={() => routeTo('report')} toIdentity={() => routeTo('identity')} toEvidence={() => routeTo('evidence')} startAnother={startAnother}/>}
        {step > 1 && matchesRecord && !evidenceReady && <section className="consumer-panel jw-empty-state"><h2>先完成主体核对</h2><p>请先核对经营主体，或选择无法确认后查看线索。</p><button className="consumer-primary" onClick={() => routeTo('identity')}>返回主体核对 →</button></section>}
        {step === 1 && matchesRecord && <div className="jw-flow-actions jw-identity-actions"><button className="jw-flow-back" onClick={() => { cancel(); navigate('/investigations/new'); }}>← 修改输入</button><div><button className="jw-flow-secondary" disabled={pending !== null} onClick={() => { update({ selected: '', confirmation: '', identityUnconfirmed: true }); routeTo('evidence'); }}>我无法确认主体，先看线索 ↗</button><button type="submit" form="jw-identity-form" className="consumer-primary" disabled={!selected || !confirmation.trim() || pending !== null}>{pending === 'analyse' ? '正在读取证据…' : '确认主体并查看证据'}</button></div></div>}
        <aside className="jw-workflow-support"><a href="/story">一次查证，如何开始 ↗</a><details className="jw-connections" onToggle={event => setConnectionsOpen(event.currentTarget.open)}><summary>资料渠道与连接状态</summary><p>公开检索：{cap?.search || '状态未取得'} · 企业接口：{cap ? cap.qcc_configured ? '已配置' : '未配置' : '状态未取得'} · 模型辅助：{cap ? cap.agent_enabled ? '已配置' : '未配置' : '状态未取得'}</p><p>美团授权数据：尚未接入；公开检索结果不等同于美团官方接口记录。</p><p>已配置不等于本次调用成功；实际取得情况见查证记录。</p>{connectionsOpen && <QccSession active={connectionsOpen}/>}</details><details className="jw-draft-tools"><summary>草稿管理</summary><p>当前草稿保存在本标签页，回退或查看方法不会清除内容。</p><button className="ghost" onClick={() => { cancel(); setSnapshot({ ...emptyVerification, conditions: { ...emptyVerification.conditions } }); navigate('/investigations/new'); }}>清除本次记录</button></details></aside>
      </main>}
    {detail && <Drawer viewKey={detail.map(source => source.id).join(',')} onClose={() => setDetail(null)}><h2>本次查证来源</h2>{detail.map(source => <article className="consumer-source" key={source.id}><h3>{source.title}</h3><p>{source.publisher} · {sourceLabel(source)}{source.cached ? ' · 历史缓存' : ''}</p><blockquote>{source.excerpt}</blockquote><p>公开日期：{source.published_at || '未知'} · {source.date_semantics}</p><p>取得时间：{formatTime(source.fetched_at)}</p><p>{source.page_status}</p>{sourceUrl(source.url) ? <a href={sourceUrl(source.url)!} target="_blank" rel="noreferrer">打开原始链接 ↗</a> : <p>未提供有效原文链接</p>}</article>)}</Drawer>}
    <XiaoXCompanion activity={xiaoxActivity} routeKey={path} busy={pending !== null} dancing={dancing} onDance={toggleDance} onVoiceQuery={acceptVoiceQuery} companyName={matchesRecord && selected && confirmation.trim() ? discovery?.candidates.find(candidate => candidate.id === selected)?.name : undefined}/>
  </div>;
}

