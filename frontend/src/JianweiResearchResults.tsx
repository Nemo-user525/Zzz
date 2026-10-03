import type { Evidence, RiskAnalysis } from './api/consumer';
import { ConsumerOutlook } from './ConsumerOutlook';
import { riskDecision } from './jianweiRiskDecision';
import './jianwei-research-results.css';

const confidenceNames = { low: '低确信度', medium: '中等确信度', high: '较高确信度' };
const evidenceIndicators = [
  { id: 'identity', label: '门店与公司是否对应' },
  { id: 'continuity', label: '服务能否持续' },
  { id: 'refund', label: '退款与履约线索' },
  { id: 'changes', label: '经营主体有何变化' },
  { id: 'counter', label: '回应与后续处理' },
  { id: 'coverage', label: '判断依据够不够' },
];
const directionNames: Record<string, string> = { adverse: '不利信息', reassuring: '正向信息', context: '背景材料', supporting: '支持性线索', counter: '相反线索', uncertainty: '不确定性', mixed: '混合信息', neutral: '中性信息', risk: '风险线索', protective: '缓解因素' };

/** Lead with the assessment and action; retain assessment context beside its evidence. */
export function JianweiResearchResults({ report, showSources, sections = 'all' }: { report: RiskAnalysis; showSources: (sources: Evidence[]) => void; sections?: 'all' | 'summary' | 'details' }) {
  const { risk } = report;
  const decision = riskDecision(report);
  const sourceMap = new Map(report.sources.map(source => [source.id, source]));
  function sourceButton(ids: string[], label = '查看依据') {
    const unique = [...new Set(ids)];
    const found = unique.flatMap(id => sourceMap.has(id) ? [sourceMap.get(id)!] : []);
    const missing = unique.length - found.length;
    return <span className="jw-research-source-links">
      {found.length > 0 && <button type="button" className="jw-source-button" onClick={() => showSources(found)}>{label} · {found.length} 条 ↗</button>}
      {(missing > 0 || unique.length === 0) && <details className="jw-research-source-status"><summary>引用信息</summary><small className="jw-research-missing">{missing > 0 ? `${missing} 条引用来源未返回，暂不可核对` : '尚无引用来源'}</small></details>}
    </span>;
  }
  function citations(items: { source_id: string; quote: string }[]) {
    if (!items.length) return sourceButton([]);
    return <ul className="jw-research-citations">{items.map((item, index) => <li key={`${item.source_id}-${index}`}>
      {item.quote && <blockquote>{item.quote}</blockquote>}{sourceButton([item.source_id], '核对引用')}
    </li>)}</ul>;
  }
  return <div className="jw-research-results" aria-label={sections === 'details' ? '分项调查分析' : '本次调查分析'}>
    {sections !== 'details' && <>
    <section className="jw-research-section" aria-labelledby="jw-research-summary">
      <p className="jw-overline">ASSESSMENT & SUMMARY</p><h3 id="jw-research-summary">风险结论</h3>
      <div className="jw-research-decision" data-risk={decision.level} data-basis={decision.basis}>
        <p className="jw-research-decision-scope">{decision.scope}</p>
        <h4>{decision.label}</h4>
        <p className="jw-research-action">{decision.action}</p>
        <p className="jw-research-summary">{decision.explanation}</p>
      </div>
      <details className="jw-research-context"><summary>查看资料范围与判断说明</summary>
        {report.summary && <p>{report.summary}</p>}
        <p className="jw-research-meta">分析生成：{report.generated_at || '未提供'} · 资料截至：{report.evidence_as_of || '未提供'}</p>
        <p className="jw-research-meta">分析方式：{report.mode || '未提供'} · 备用分析：{report.fallback ? '已启用' : '未启用'}</p>
        {risk && <>
          <div className="jw-research-confidence" data-confidence={risk.confidence || 'unknown'}>
            <h4>判断确信度</h4>
            <p>{risk.confidence ? confidenceNames[risk.confidence] : risk.confidence_label || '未提供确信度'}</p>
            {risk.confidence_label && risk.confidence && risk.confidence_label !== confidenceNames[risk.confidence] && <small>原始说明：{risk.confidence_label}</small>}
            {risk.confidence_explanation && <p>{risk.confidence_explanation}</p>}
            <small>{risk.model_assessed ? '已完成模型评估' : '未完成模型评估'} · 审阅 {risk.reviewed_source_count} 条来源</small>
          </div>
          {!!risk.confidence_dimensions?.length && <dl className="jw-research-dimensions">{risk.confidence_dimensions.map((dimension, index) => <div key={index}><dt>{dimension.label}</dt><dd>{dimension.value}</dd></div>)}</dl>}
          {!!risk.limitations.length && <div className="jw-research-limits"><h4>判断范围</h4><ul>{risk.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul></div>}
        </>}
      </details>
    </section>

    <section className="jw-research-section" aria-label="决策提示与判断依据">
      <h3>为什么这样判断</h3>
      {risk ? <>
        {risk.reasons.length ? <ol className="jw-research-reasons">{risk.reasons.map((reason, index) => <li key={index}>
          <span className="jw-research-meta">{directionNames[reason.direction] || reason.direction}</span><p>{reason.explanation}</p>{citations(reason.citations)}
        </li>)}</ol> : <p className="jw-research-missing">本次未返回带引用的判断理由。</p>}
      </> : <p>{decision.explanation}</p>}
    </section>
    </>}
    {sections !== 'summary' && <>
    <section className="jw-research-section" aria-label="分项调查结果">
      <div className="jw-indicators-heading"><h3>六项证据指标</h3><p>逐项查看调查结果，点击依据可打开来源。</p></div>
      <div className="jw-research-indicators">{evidenceIndicators.map((item, index) => {
        const indicator = report.indicators.find(row => row.id === item.id);
        return <article key={item.id} data-indicator={item.id}>
        <span className="jw-indicator-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
        <div className="jw-indicator-content"><h4>{item.label}</h4>
        {indicator ? <><p className="jw-research-value">{indicator.value}</p><p>{indicator.explanation}</p>{sourceButton(indicator.source_ids)}
        {!!indicator.agent_findings.length && <div className="jw-research-findings">{indicator.agent_findings.map((finding, index) => <div key={index}><p>{finding.explanation}</p>{citations(finding.citations)}{finding.question && <details><summary>补充问题</summary><p>{finding.question}</p></details>}</div>)}</div>}
        {!!indicator.missing.length && <details className="jw-research-limits"><summary>资料范围</summary><ul>{indicator.missing.map((missing, index) => <li key={index}>{missing}</li>)}</ul></details>}
        </> : <p className="jw-research-missing">本次未返回该项分析。</p>}
        </div></article>;
      })}</div>
    </section>

    <section className="jw-research-section" aria-label="变化与相反解释">
      <h3>变化与相反解释</h3>
      {report.changes.length ? <ol className="jw-research-changes">{report.changes.map(change => <li key={change.id}>
        <h4>{change.title}</h4>
        <p>{change.fact_text}</p>{sourceButton(change.source_ids, '核对变化出处')}<p>{change.consumer_relevance}</p>
        {!!change.interpretations.length && <div className="jw-research-interpretations"><h5>可能的解释与相反依据</h5>{change.interpretations.map((interpretation, index) => <article key={index}><p>{interpretation.text}</p><div><span>支持依据：</span>{sourceButton(interpretation.supporting_source_ids, '查看支持依据')}</div><div><span>相反依据：</span>{sourceButton(interpretation.counter_source_ids, '查看相反依据')}</div></article>)}</div>}
        <details className="jw-research-limits"><summary>时间与资料说明</summary>
          <p className="jw-research-meta">{change.stage} · 事件日期：{change.event_date || '未提供'} · 材料公开日期：{change.published_at || '未提供'}</p>
          {!!change.missing_evidence.length && <ul>{change.missing_evidence.map((missing, index) => <li key={index}>{missing}</li>)}</ul>}
        </details>
      </li>)}</ol> : <p className="jw-research-missing">本次未形成可展示的变化记录，不代表企业没有变化。</p>}
      <details><summary>检索范围说明</summary><p>{report.counter_search_status || '本次未返回相反信息的检索状态。'}</p></details>
      {!!report.counter_source_ids.length && sourceButton(report.counter_source_ids, '查看回应与反证')}
    </section>

    <details className="jw-research-outlook"><summary>评价与收支情景</summary><ConsumerOutlook report={report} sourceButton={sourceButton} /></details>

    <section className="jw-research-section" aria-label="调查后续问题">
      <details><summary>进一步了解：问题与资料范围</summary>
      {report.questions.length ? <ol className="jw-research-questions">{report.questions.map((question, index) => <li key={index}>{question}</li>)}</ol> : <p className="jw-research-missing">本次未返回进一步核对的问题。</p>}
      {!!report.unknowns.length && <div className="jw-research-limits"><h4>仍未知道的事</h4><ul>{report.unknowns.map((unknown, index) => <li key={index}>{unknown}</li>)}</ul></div>}
      </details>
    </section>
    </>}
  </div>;
}
