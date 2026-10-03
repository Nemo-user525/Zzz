import type { Evidence } from './api/consumer';
import { JianweiResearchResults } from './JianweiResearchResults';
import { JianweiEvidenceFinder } from './JianweiSearchTools';
import { formatTime, isStale, questionsFor, reportText, sourceLabel, verificationSources, type VerificationSnapshot } from './jianweiVerification';

export function JianweiVerificationReport({ snapshot, showSources, report = false, toReport, toIdentity, toEvidence, startAnother }: { snapshot: VerificationSnapshot; showSources: (sources: Evidence[]) => void; report?: boolean; toReport: () => void; toIdentity: () => void; toEvidence: () => void; startAnother: () => void }) {
  const sources = verificationSources(snapshot);
  const chosen = snapshot.discovery?.candidates.find(candidate => candidate.id === snapshot.selected);
  const unconfirmed = snapshot.identityUnconfirmed || !chosen;
  const generated = snapshot.report?.generated_at || snapshot.discovery?.generated_at;
  const timeline = [...sources].sort((a, b) => (Date.parse(b.published_at || '') || 0) - (Date.parse(a.published_at || '') || 0));
  const gaps = [...new Set(['门店、合同抬头与收款方的一致性尚未独立核验。', ...(snapshot.report?.unknowns || snapshot.discovery?.unknowns || [])])];
  const traced = snapshot.report?.trace || snapshot.discovery?.trace || [];
  const failures = traced.filter(step => ['failed', 'not_configured'].includes(step.status));
  function save() {
    const blob = new Blob([reportText(snapshot)], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `见微-初步查证卡-${snapshot.query.replace(/[\\/:*?"<>|]/g, '_')}.md`;
    document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className={`jw-verification-result ${report ? 'jw-print-report' : ''}`} aria-label={report ? '付款前核对卡' : '证据时间线'}>
    <div className="jw-result-head"><p className="jw-overline">{report ? 'YOUR CHECKLIST' : 'FOLLOW THE EVIDENCE'}</p><h2>{report ? '初步查证卡' : '让每条线索，有出处。'}</h2><p>{unconfirmed ? '这家店的经营主体待确认' : `已选择研究对象：${chosen.name}；门店归属仍待独立核验`}。本次查到 <strong>0 条已核实事实</strong>和 <strong>{sources.length} 条待核实线索</strong>；付款前，建议先核对合同抬头与实际收款方。</p><span>查证时间：{formatTime(generated)}</span></div>
    {isStale(snapshot) && <p className="consumer-message">这份记录已超过 24 小时。来源可能变化，建议重新查证；原查询时间未被改写。</p>}
    {report && <div className="jw-report-tools"><button className="ghost" onClick={() => window.print()}>打印 / 保存 PDF</button><p>导出会保留查询时间、未知项与原始来源。</p></div>}
    {report && <section className="jw-report-section"><h3>01 · 我准备做什么</h3><dl className="jw-facts"><dt>门店与位置</dt><dd>{snapshot.query} · {snapshot.location || '位置未提供'}</dd><dt>消费意图</dt><dd>{{ initial_purchase: '首次办卡／购买课包', top_up: '追加充值', renewal: '续费', explore: '先了解一下' }[snapshot.conditions.intent]}</dd><dt>预付金额</dt><dd>{snapshot.conditions.amount_yuan == null ? '未提供' : `${snapshot.conditions.amount_yuan.toLocaleString('zh-CN')} 元`}</dd><dt>服务期限</dt><dd>{snapshot.conditions.service_duration_months == null ? '未提供' : `${snapshot.conditions.service_duration_months} 个月`}</dd></dl></section>}
    <section className="jw-report-section"><h3>{report ? '02 · ' : ''}经营主体</h3><p>{unconfirmed ? '主体未确认。以下为关键词相关资料，不把任何一家公司的记录直接归于这家门店。' : `${chosen.name}（用户选择，尚未独立核验）`}</p>{!unconfirmed && <><p>用户确认依据：{snapshot.confirmation || '未提供'}</p><p>候选匹配说明：{chosen.basis}</p></>}<small>“用户选择”与“来源核验”分别记录。总部、加盟商、分店和收款方不能自动等同。</small></section>
    {!unconfirmed && snapshot.report?.identity.id === chosen.id && <><JianweiResearchResults report={snapshot.report} showSources={showSources}/><JianweiEvidenceFinder report={snapshot.report}/></>}
    <section className="jw-report-section"><h3>{report ? '03 · ' : ''}已核实事实时间线</h3><p>当前为 0 条。接口尚未提供完成主体、日期与原文联合核验的事实记录。读到原文或取得接口记录，不会自动升级为已核实事实。</p></section>
    <section className="jw-report-section"><div className="consumer-section-head"><h3>{report ? '04 · ' : ''}其他线索与材料时间线</h3><span>{sources.length} 条 · 去重后</span></div><p className="jw-evidence-key">按材料公开日期排列，未知日期单列。这里展示的是线索，不是已经确认的企业事件。</p>
      {!sources.length && <p>本次未取得可展示的资料。可补充门店地址或完整公司名称后重试。</p>}
      <ol className="jw-source-timeline">{timeline.map(source => <li key={source.id}><div className="jw-source-date">{source.published_at || '公开日期未知'}<small>{source.date_semantics || '日期含义未核对'}</small></div><article><span className="jw-source-status">{sourceLabel(source)}{source.cached ? ' · 历史缓存' : ''}</span><h4>{source.title}</h4><p>{source.excerpt}</p><small>{source.publisher} · {unconfirmed ? '关键词相关，归属未确认' : source.scope === 'brand_context' ? '品牌背景，不能归为所选公司的事实' : '与所选研究对象相关，仍需核对归属'}</small><button className="jw-source-button" onClick={() => showSources([source])}>查看来源与核验详情 ↗</button><span className="jw-print-url">{source.url}</span></article></li>)}</ol>
    </section>
    <section className="jw-report-section"><h3>{report ? '05 · ' : ''}资料缺口与相反信息</h3><ul>{gaps.map(gap => <li key={gap}>{gap}</li>)}</ul>{failures.length > 0 && <div><h4>本次未能完成的来源</h4><ul>{failures.map((step, index) => <li key={index}>{step.action}：{step.detail}</li>)}</ul></div>}
      <p>{snapshot.report?.counter_search_status || '尚未完成相反信息核对；不能理解为不存在相反信息。'}</p>{!!snapshot.report?.counter_source_ids?.length && <button className="ghost" onClick={() => showSources(sources.filter(source => snapshot.report!.counter_source_ids.includes(source.id)))}>查看回应与相反依据</button>}
    </section>
    <section className="jw-report-section jw-questions"><h3>{report ? '06 · ' : ''}付款前，最值得问的 3 个问题</h3><ol>{questionsFor(snapshot.conditions).map(question => <li key={question}>{question}</li>)}</ol><small>金额与期限只用于生成提问，不用于预测企业风险。</small></section>
    <section className="jw-report-section"><h3>{report ? '07 · ' : ''}查证记录</h3><p>查询时间：{formatTime(generated)} · 编号：{snapshot.discovery?.investigation_id}</p><p>已取得 {sources.length} 条资料；{sources.filter(source => source.verification_status === 'page_text').length} 条已读取正文，{sources.filter(source => source.verification_status === 'provider_response').length} 条接口记录。以上均不等于已核实事实。</p><details><summary>查看实际查询动作与来源状态（{traced.length} 步）</summary><ol>{traced.map((step, index) => <li key={index}><strong>{step.action}</strong> · {({ completed: '已执行', failed: '失败', not_configured: '未配置', cached: '历史缓存', user_selected: '用户选择', needs_confirmation: '需确认' } as Record<string, string>)[step.status] || step.status}<p>{step.detail}</p></li>)}</ol></details><p>这是一份查证与提问辅助记录，不提供安全评级、倒闭预测或付款保证。</p></section>
    <div className="jw-flow-actions"><button className="jw-flow-back" onClick={report ? toEvidence : toIdentity}>{report ? '← 返回证据' : '← 返回主体核对'}</button><div>{report ? <><button className="jw-flow-secondary" onClick={startAnother}>再查一家</button><button className="consumer-primary" onClick={save}>保存核对卡</button></> : <><span>下一步：留下已知、未知与待问问题</span><button className="consumer-primary" onClick={toReport}>生成付款前核对卡 ↗</button></>}</div></div>
  </section>;
}
