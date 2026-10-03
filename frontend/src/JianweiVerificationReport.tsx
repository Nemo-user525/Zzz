import type { Evidence } from './api/consumer';
import { JianweiResearchResults } from './JianweiResearchResults';
import { JianweiEvidenceFinder } from './JianweiSearchTools';
import { formatTime, isStale, questionsFor, reportText, selectedAnalysis, verificationSources, type VerificationSnapshot } from './jianweiVerification';
import { riskDecision } from './jianweiRiskDecision';

export function JianweiVerificationReport({ snapshot, showSources, report = false, toReport, toIdentity, toEvidence, startAnother }: { snapshot: VerificationSnapshot; showSources: (sources: Evidence[]) => void; report?: boolean; toReport: () => void; toIdentity: () => void; toEvidence: () => void; startAnother: () => void }) {
  const sources = verificationSources(snapshot);
  const chosen = snapshot.discovery?.candidates.find(candidate => candidate.id === snapshot.selected);
  const unconfirmed = snapshot.identityUnconfirmed || !chosen;
  const analysis = selectedAnalysis(snapshot);
  const decision = riskDecision(analysis, sources.length, !unconfirmed);
  const generated = snapshot.report?.generated_at || snapshot.discovery?.generated_at;
  const timeline = [...sources].sort((a, b) => (Date.parse(b.published_at || '') || 0) - (Date.parse(a.published_at || '') || 0));
  const gaps = [...new Set(['门店、合同抬头与收款方的一致性尚未独立核验。', ...(snapshot.report?.unknowns || snapshot.discovery?.unknowns || [])])];
  const traced = snapshot.report?.trace || snapshot.discovery?.trace || [];
  const failures = traced.filter(step => ['failed', 'not_configured'].includes(step.status));
  function save() {
    const blob = new Blob([reportText(snapshot)], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `见微-风险判断卡-${snapshot.query.replace(/[\\/:*?"<>|]/g, '_')}.md`;
    document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className={`jw-verification-result ${report ? 'jw-print-report' : ''}`} aria-label={report ? '付款前核对卡' : '证据时间线'}>
    <div className="jw-result-head"><p className="jw-overline">{report ? 'YOUR RISK ASSESSMENT' : 'FOLLOW THE EVIDENCE'}</p><h2>{report ? '风险判断卡' : '风险判断，有据可循。'}</h2><p>{unconfirmed ? `查询对象：${snapshot.query}` : `研究对象：${chosen.name}`}。本次整理 <strong>{sources.length} 条来源材料</strong>，结论、判断依据与付款建议如下。</p><span>分析时间：{formatTime(generated)}</span></div>
    {isStale(snapshot) && <p className="consumer-message">这份记录已超过 24 小时。来源可能变化，建议重新查证；原查询时间未被改写。</p>}
    {analysis ? <JianweiResearchResults report={analysis} showSources={showSources} sections="summary"/> : <section className="jw-assessment-pending" aria-labelledby="jw-pending-summary">
      <p className="jw-overline">ASSESSMENT & SUMMARY</p><h3 id="jw-pending-summary">风险评估与总结</h3>
      <p className="jw-assessment-status">{decision.label} · 预付决策建议</p>
      <p>{decision.action}</p><p>{decision.explanation}</p><small>{decision.scope}</small>
      <button className="consumer-primary" onClick={toIdentity}>核对主体，继续风险评估 →</button>
    </section>}
    {report && <div className="jw-report-tools"><button className="ghost" onClick={() => window.print()}>打印 / 保存 PDF</button><p>导出会保留查询时间、未知项与原始来源。</p></div>}
    {report && <section className="jw-report-section"><h3>01 · 我准备做什么</h3><dl className="jw-facts"><dt>门店与位置</dt><dd>{snapshot.query} · {snapshot.location || '位置未提供'}</dd><dt>消费意图</dt><dd>{{ initial_purchase: '首次办卡／购买课包', top_up: '追加充值', renewal: '续费', explore: '先了解一下' }[snapshot.conditions.intent]}</dd><dt>预付金额</dt><dd>{snapshot.conditions.amount_yuan == null ? '未提供' : `${snapshot.conditions.amount_yuan.toLocaleString('zh-CN')} 元`}</dd><dt>服务期限</dt><dd>{snapshot.conditions.service_duration_months == null ? '未提供' : `${snapshot.conditions.service_duration_months} 个月`}</dd></dl></section>}
    <section className="jw-report-section"><h3>{report ? '02 · ' : ''}经营主体</h3><p>{unconfirmed ? '以下为关键词相关资料。选择实际收款公司后，可查看该主体的风险判断。' : chosen.name}</p><details><summary>查看主体匹配详情</summary>{!unconfirmed && <>{snapshot.confirmation.trim() && <p>用户确认依据：{snapshot.confirmation}</p>}<p>候选匹配说明：{chosen.basis}</p></>}<p>总部、加盟商、分店和收款方分别记录，所选公司的判断不自动适用于其他主体。</p></details></section>
    {analysis && <><JianweiResearchResults report={analysis} showSources={showSources} sections="details"/><JianweiEvidenceFinder report={analysis}/></>}
    <section className="jw-report-section"><div className="consumer-section-head"><h3>{report ? '03 · ' : ''}来源材料时间线</h3><span>{sources.length} 条 · 去重后</span></div><p className="jw-evidence-key">按材料公开日期排列，可打开原文查看完整上下文。</p>
      {!sources.length && <p>本次未取得可展示的资料。可补充门店地址或完整公司名称后重试。</p>}
      <ol className="jw-source-timeline">{timeline.map(source => <li key={source.id}><div className="jw-source-date">{source.published_at || '公开日期未知'}<small>{source.date_semantics || '材料日期'}</small></div><article><span className="jw-source-status">{{ search_excerpt: '搜索摘要', page_text: '网页正文', provider_response: '接口资料' }[source.verification_status]}{source.cached ? ' · 历史缓存' : ''}</span><h4>{source.title}</h4><p>{source.excerpt}</p><small>{source.publisher} · {unconfirmed ? '关键词相关资料' : source.scope === 'brand_context' ? '品牌背景' : '研究对象相关资料'}</small><button className="jw-source-button" onClick={() => showSources([source])}>查看来源与核验详情 ↗</button><span className="jw-print-url">{source.url}</span></article></li>)}</ol>
    </section>
    <section className="jw-report-section"><h3>{report ? '04 · ' : ''}资料范围与补充说明</h3>{!!analysis?.counter_source_ids?.length && <button className="ghost" onClick={() => showSources(sources.filter(source => analysis.counter_source_ids.includes(source.id)))}>查看回应与相反依据</button>}<details><summary>查看资料覆盖与查询详情</summary><ul>{gaps.map(gap => <li key={gap}>{gap}</li>)}</ul>{failures.length > 0 && <div><h4>本次未能完成的来源</h4><ul>{failures.map((step, index) => <li key={index}>{step.action}：{step.detail}</li>)}</ul></div>}
      <p>{analysis?.counter_search_status || '本轮尚无相反信息检索记录。'}</p></details>
    </section>
    <section className="jw-report-section jw-questions"><h3>{report ? '05 · ' : ''}付款前，最值得问的 3 个问题</h3><ol>{questionsFor(snapshot.conditions).map(question => <li key={question}>{question}</li>)}</ol><small>结合本次消费金额与服务期限生成。</small></section>
    <section className="jw-report-section"><h3>{report ? '06 · ' : ''}查证记录</h3><p>查询时间：{formatTime(generated)} · 编号：{snapshot.discovery?.investigation_id}</p><details><summary>查看实际查询动作与来源状态（{traced.length} 步）</summary><p>已取得 {sources.length} 条资料；{sources.filter(source => source.verification_status === 'page_text').length} 条已读取正文，{sources.filter(source => source.verification_status === 'provider_response').length} 条接口记录。来源类型与获取状态保留用于追溯。</p><ol>{traced.map((step, index) => <li key={index}><strong>{step.action}</strong> · {({ completed: '已执行', failed: '失败', not_configured: '未配置', cached: '历史缓存', user_selected: '用户选择', needs_confirmation: '需确认' } as Record<string, string>)[step.status] || step.status}<p>{step.detail}</p></li>)}</ol></details></section>
    <div className="jw-flow-actions"><button className="jw-flow-back" onClick={report ? toEvidence : toIdentity}>{report ? '← 返回证据' : '← 返回主体核对'}</button><div>{report ? <><button className="jw-flow-secondary" onClick={startAnother}>再查一家</button><button className="consumer-primary" onClick={save}>保存核对卡</button></> : <><span>下一步：保存风险结论与判断依据</span><button className="consumer-primary" onClick={toReport}>生成付款前核对卡 ↗</button></>}</div></div>
  </section>;
}
