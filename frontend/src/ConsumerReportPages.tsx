import type { ReactNode } from 'react';
import type { Evidence, RiskAnalysis } from './api/consumer';
import { ConsumerOutlook } from './ConsumerOutlook';
import { displayText, riskHeadline, riskPlainExplanation } from './consumerPresentation';

export type ReportPage = 'overview'|'identity'|'risk'|'reviews'|'cashflow'|'indicators'|'changes'|'questions'|'evidence'|'methods'|'trace';
const time = (value:string) => new Date(value).toLocaleString('zh-CN');
const evidenceLabel = (s:Evidence) => ({page_text:'已读到原文',search_excerpt:'只看到搜索摘要',provider_response:'接口返回的资料'}[s.verification_status]);
const channelLabel:Record<string,string> = {government:'官方公示',registry:'企业登记与企查查',community:'消费者反馈',public_web:'新闻和网页'};
const pageTitle:Record<ReportPage,string> = {
  overview:'查询结果',identity:'这家公司是谁',risk:'为什么是这个风险',reviews:'消费者怎么说',cashflow:'未来收支试算',
  indicators:'逐项查看情况',changes:'最近有什么变化',questions:'还要问门店什么',evidence:'全部证据',methods:'调查范围与局限',trace:'调查过程',
};

export function ConsumerReportPages({report,page,onPage,onNewSearch,sourceButton,detail,onCloseDetail}:{
  report:RiskAnalysis;page:ReportPage;onPage:(page:ReportPage)=>void;onNewSearch:()=>void;
  sourceButton:(ids:string[],label?:string)=>ReactNode;detail:Evidence[]|null;onCloseDetail:()=>void;
}) {
  const risk = report.risk;
  const level = risk?.decision_level || (risk?.level === 'undetermined' ? 'medium' : risk?.level) || 'medium';
  const confidence = risk?.confidence === 'high' ? '把握较大' : '把握一般';
  const back = <button type="button" className="consumer-page-back" onClick={()=>onPage('overview')}>← 返回查询结果</button>;
  const card = (target:ReportPage,description:string,count?:number) => <button type="button" className="consumer-page-card" onClick={()=>onPage(target)} key={target}>
    <strong>{pageTitle[target]}</strong><span>{description}</span><b>{count == null ? '查看 →' : `${count} 条 · 查看 →`}</b>
  </button>;
  return <section className="consumer-report" aria-label="企业变化与消费判断卡">
    {detail ? <section className="consumer-panel consumer-page"><h2>证据详情</h2><p>这里列出刚才点击的资料。可以打开来源，核对原文和日期。</p>
      {detail.map(s=><article className="consumer-source" key={s.id}><h3>{s.title}</h3><p>{s.scope==='brand_context'?'品牌或门店资料 · ':''}{s.publisher} · {evidenceLabel(s)}{s.cached?' · 以前取得的资料':''}</p><blockquote>{s.excerpt}</blockquote><p>公开日期：{s.published_at||'没有标明'} · {s.date_semantics}</p><p>取得时间：{time(s.fetched_at)}</p><p>{s.page_status}</p><a href={s.url} target="_blank" rel="noreferrer">{s.channel==='registry'?'查看接口说明':'打开原始链接'} ↗</a></article>)}
      <button type="button" className="consumer-page-back" onClick={onCloseDetail}>← 返回上一页</button>
    </section> : <>
      <header className="consumer-page-heading"><div><span className="eyebrow">{report.identity.name}</span><h2>{pageTitle[page]}</h2></div>{page==='overview'?<button type="button" className="ghost" onClick={onNewSearch}>重新查询</button>:null}</header>
      {page==='overview'&&<>
        <div className={'consumer-risk risk-'+level} aria-label="风险等级"><div><h2>{riskHeadline(risk)}</h2><p className="consumer-plain-lead">{riskPlainExplanation(risk)}</p><strong className="confidence-badge">这次判断：{confidence}</strong><small>{!risk||risk.decision_basis==='information_gap'?'本次采用预付消费的谨慎档，建议选择短期、小额产品。':'评级对象为所选公司；签约和收款名称请与报告对象一致。'}</small></div>
          <div className="risk-stats"><strong>{report.sources.length}<small>条查到的资料</small></strong><strong>{report.source_stats?.websites??new Set(report.sources.map(s=>s.publisher)).size}<small>个来源网站</small></strong></div></div>
        <div className="consumer-page-grid">
          {card('identity','先看选中的是哪家公司')}
          {card('risk','看风险判断的原因和把握有多大',risk?.reasons.length||0)}
          {card('evidence','逐条看查到的资料与出处',report.sources.length)}
          {!!report.reviews?.collected_count&&card('reviews','看本次查到的消费者评价',report.reviews.collected_count)}
          {!!report.cashflow?.scenarios.length&&card('cashflow','看不同情况下的收支试算')}
          {card('indicators','逐项看经营和服务线索',report.indicators.length)}
          {!!report.changes.length&&card('changes','看近期值得核对的变化',report.changes.length)}
          {!!report.questions.length&&card('questions','办卡或续费前问清楚',report.questions.length)}
          {card('methods','看本次查了什么、还缺什么')}
          {!!report.trace.length&&card('trace','看实际查找和核对过程',report.trace.length)}
        </div>
      </>}
      {page==='identity'&&<section className="consumer-panel consumer-page"><h3>{report.identity.name}</h3><p>{displayText(report.identity.relationship_status)}</p><p>{displayText(report.summary)}</p><p>资料取得截至 {time(report.evidence_as_of)}。</p><p>{displayText(report.agent_status)}</p>{sourceButton(report.identity.source_ids,'查看主体依据')}{back}</section>}
      {page==='risk'&&<section className="consumer-panel consumer-page"><h3>{riskHeadline(risk)}</h3><p className="consumer-plain-lead">{riskPlainExplanation(risk)}</p><p>这次判断：{confidence}。它说的是资料够不够，不是成功率或退款概率。</p>
        {risk?.reasons.map((reason,i)=><article className="risk-reason" key={i}><p>{displayText(reason.explanation)}</p>{sourceButton(reason.citations.map(c=>c.source_id),'看这条的证据')}</article>)}
        {!risk?.reasons.length&&<p>目前没有足够的具体材料能解释企业风险高低。请先核对证据和门店信息。</p>}
        <details><summary>查看完整分析和判断范围</summary><p>{displayText(risk?.explanation||'本次没有完成有来源支持的评估。')}</p><p>{displayText(risk?.confidence_explanation||'资料仍不够。')}</p><ul>{risk?.limitations.map(x=><li key={x}>{displayText(x)}</li>)}</ul></details>{back}
      </section>}
      {page==='reviews'&&<><ConsumerOutlook report={report} sourceButton={sourceButton} section="reviews"/>{back}</>}
      {page==='cashflow'&&<><ConsumerOutlook report={report} sourceButton={sourceButton} section="cashflow"/>{back}</>}
      {page==='indicators'&&<section className="consumer-indicators">{report.indicators.filter(i=>i.source_ids.length>0||(i.id!=='counter'&&i.agent_findings.length>0)).map(i=><article className="consumer-panel" key={i.id}><h3>{i.label}</h3><strong className="consumer-indicator-value">{displayText(i.value)}</strong><p>{displayText(i.explanation)}</p>{i.agent_findings.map((f,j)=><div className="consumer-finding" key={j}><p>{displayText(f.explanation)}</p>{f.citations.map((c,k)=><blockquote key={k}>“{c.quote}”{sourceButton([c.source_id],'出处')}</blockquote>)}<p>可以问：{displayText(f.question)}</p></div>)}{!!i.missing.length&&<small>还缺：{i.missing.join('；')}</small>}{!!i.source_ids.length&&sourceButton(i.source_ids,'查看证据')}</article>)}</section>}
      {page==='indicators'&&back}
      {page==='changes'&&<section className="consumer-panel consumer-page">{report.changes.map(c=><article className="consumer-change" key={c.id}><h3>{c.title}</h3><p>{displayText(c.fact_text)}</p><small>日期：{c.event_date||'还没查清'} · {c.stage}</small><p>{displayText(c.consumer_relevance)}</p>{c.interpretations.map((x,j)=><p key={j}>另一种可能：{displayText(x.text)}</p>)}{sourceButton(c.source_ids,'查看证据')}</article>)}{back}</section>}
      {page==='questions'&&<section className="consumer-panel consumer-page"><h3>到店里直接问</h3><ol>{report.questions.map(q=><li key={q}>{displayText(q)}</li>)}</ol>{!!report.counter_source_ids.length&&<><h3>对方回应或其他说法</h3><p>{displayText(report.counter_search_status)}</p>{sourceButton(report.counter_source_ids,'查看回应依据')}</>}{back}</section>}
      {page==='evidence'&&<section className="consumer-panel consumer-page"><p>每条资料都能查看来源。消费者发帖是当事人的说法，还要核对是否属于这家公司。</p>{(['government','registry','community','public_web'] as const).map(channel=>{const rows=report.sources.filter(s=>s.channel===channel);if(!rows.length)return null;return <section className="evidence-group" key={channel}><h3>{channelLabel[channel]} <small>{rows.length}</small></h3>{rows.map(s=><article className="evidence-row" key={s.id}><div><h4>{s.title}</h4><small>{s.publisher} · {evidenceLabel(s)}{s.scope==='brand_context'?' · 品牌线索，未直接用于公司评级':''}</small><p>{s.excerpt}</p></div>{sourceButton([s.id],'查看详情')}</article>)}</section>;})}{!report.sources.length&&<p>本次没有取得可展示的资料。</p>}{back}</section>}
      {page==='methods'&&<section className="consumer-panel consumer-page"><h3>这次查了什么</h3><p>本次找到 {report.sources.length} 条资料，来自 {report.source_stats?.websites??new Set(report.sources.map(s=>s.publisher)).size} 个网站。</p><p>{displayText(report.criteria.limitation)}</p><h3>还缺什么</h3><ul>{report.unknowns.map(u=><li key={u}>{displayText(u)}</li>)}</ul><p>这些资料只能帮助你决定下一步问什么，不能保证以后一定不会出问题。</p>{back}</section>}
      {page==='trace'&&<section className="consumer-panel consumer-page"><ol className="consumer-trace">{report.trace.map((t,i)=><li key={i}><strong>{t.action}</strong><p>{displayText(t.detail)}</p>{!!t.source_ids.length&&sourceButton(t.source_ids,'查看这一步的资料')}</li>)}</ol>{back}</section>}
    </>}
  </section>;
}
