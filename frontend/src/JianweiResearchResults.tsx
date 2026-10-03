import type { Evidence, RiskAnalysis } from './api/consumer';
import { ConsumerOutlook } from './ConsumerOutlook';
import './jianwei-research-results.css';

const confidenceNames = { low: '低确信度', medium: '中等确信度', high: '较高确信度' };
const riskNames = { low: '低', medium: '中', high: '高', undetermined: '证据不足，无法判断' };
const directionNames: Record<string, string> = { adverse: '不利线索', supporting: '支持性线索', counter: '相反线索', uncertainty: '不确定性', mixed: '混合信息', neutral: '中性信息', risk: '风险线索', protective: '缓解因素' };

/** Displays the server assessment without rewriting its uncertainty or evidence status. */
export function JianweiResearchResults({ report, showSources }: { report: RiskAnalysis; showSources: (sources: Evidence[]) => void }) {
  const { risk } = report;
  const sourceMap = new Map(report.sources.map(source => [source.id, source]));
  function sourceButton(ids: string[], label = '查看依据') {
    const unique = [...new Set(ids)];
    const found = unique.flatMap(id => sourceMap.has(id) ? [sourceMap.get(id)!] : []);
    const missing = unique.length - found.length;
    return <span className="jw-research-source-links">
      {found.length > 0 && <button type="button" className="jw-source-button" onClick={() => showSources(found)}>{label} · {found.length} 条 ↗</button>}
      {missing > 0 && <small className="jw-research-missing">{missing} 条引用来源未返回，暂不可核对</small>}
      {unique.length === 0 && <small className="jw-research-missing">尚无引用来源</small>}
    </span>;
  }
  function citations(items: { source_id: string; quote: string }[]) {
    if (!items.length) return sourceButton([]);
    return <ul className="jw-research-citations">{items.map((item, index) => <li key={`${item.source_id}-${index}`}>
      {item.quote && <blockquote>{item.quote}</blockquote>}{sourceButton([item.source_id], '核对引用')}
    </li>)}</ul>;
  }
  return <div className="jw-research-results" aria-label="本次调查分析">
    <section className="jw-research-section" aria-labelledby="jw-research-summary">
      <p className="jw-overline">RESEARCH FINDINGS</p><h3 id="jw-research-summary">本次调查摘要</h3>
      <p className="jw-research-summary">{report.summary || '本次调查未返回摘要。'}</p>
      {report.fallback && <p className="jw-research-missing">本次使用降级分析结果，覆盖范围与限制如下。</p>}
      <p className="jw-research-meta">分析生成：{report.generated_at || '未提供'} · 资料截至：{report.evidence_as_of || '未提供'}</p>
    </section>

    <section className="jw-research-section" aria-label="决策提示与判断依据">
      <h3>决策提示与判断依据</h3>
      {risk ? <>
        <div className="jw-research-assessment">
          <div><span className="jw-overline">决策提示</span><h4>{risk.decision_label || risk.label || riskNames[risk.level]}</h4><p>{risk.decision_explanation || risk.explanation}</p>
            {risk.decision_basis && <small>依据类型：{risk.decision_basis === 'information_gap' ? '信息缺口' : '企业材料'}</small>}
          </div>
          <div className="jw-research-confidence" data-confidence={risk.confidence || 'unknown'}><span className="jw-overline">判断确信度</span><h4>{risk.confidence ? confidenceNames[risk.confidence] : risk.confidence_label || '未提供确信度'}</h4>
            {risk.confidence_label && risk.confidence && risk.confidence_label !== confidenceNames[risk.confidence] && <small>原始说明：{risk.confidence_label}</small>}
            <p>{risk.confidence_explanation || '本次结果未提供确信度说明。'}</p>
            <small>{risk.model_assessed ? '已完成模型评估' : '未完成模型评估'} · 审阅 {risk.reviewed_source_count} 条来源</small>
          </div>
        </div>
        {risk.decision_label && <p className="jw-research-meta">材料风险判断：{risk.label || riskNames[risk.level]}。{risk.explanation}</p>}
        {!!risk.confidence_dimensions?.length && <dl className="jw-research-dimensions">{risk.confidence_dimensions.map((dimension, index) => <div key={index}><dt>{dimension.label}</dt><dd>{dimension.value}</dd></div>)}</dl>}
        <h4>判断理由</h4>
        {risk.reasons.length ? <ol className="jw-research-reasons">{risk.reasons.map((reason, index) => <li key={index}>
          <span className="jw-research-meta">{directionNames[reason.direction] || reason.direction}</span><p>{reason.explanation}</p>{citations(reason.citations)}
        </li>)}</ol> : <p className="jw-research-missing">本次未返回带引用的判断理由。</p>}
        {!!risk.limitations.length && <div className="jw-research-limits"><h4>判断限制</h4><ul>{risk.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul></div>}
      </> : <p className="jw-research-missing">本次未返回决策评估，不能据此认定风险高低。</p>}
    </section>

    <section className="jw-research-section" aria-label="分项调查结果">
      <h3>逐项看，哪些已有线索</h3>
      {report.indicators.length ? <div className="jw-research-indicators">{report.indicators.map(indicator => <article key={indicator.id}>
        <h4>{indicator.label}</h4><p className="jw-research-value">{indicator.value}</p><p>{indicator.explanation}</p>{sourceButton(indicator.source_ids)}
        {!!indicator.agent_findings.length && <div className="jw-research-findings">{indicator.agent_findings.map((finding, index) => <div key={index}><p>{finding.explanation}</p>{citations(finding.citations)}{finding.question && <p>待问：{finding.question}</p>}</div>)}</div>}
        {!!indicator.missing.length && <div className="jw-research-limits"><h5>仍缺少什么</h5><ul>{indicator.missing.map((missing, index) => <li key={index}>{missing}</li>)}</ul></div>}
      </article>)}</div> : <p className="jw-research-missing">本次未返回分项分析。</p>}
    </section>

    <section className="jw-research-section" aria-label="变化与相反解释">
      <h3>变化与相反解释</h3>
      {report.changes.length ? <ol className="jw-research-changes">{report.changes.map(change => <li key={change.id}>
        <h4>{change.title}</h4><p className="jw-research-meta">{change.stage} · 事件日期：{change.event_date || '未核实'} · 材料公开日期：{change.published_at || '未核实'}</p>
        <p>{change.fact_text}</p>{sourceButton(change.source_ids, '核对变化出处')}<p>{change.consumer_relevance}</p>
        {!!change.interpretations.length && <div className="jw-research-interpretations"><h5>可能的解释与相反依据</h5>{change.interpretations.map((interpretation, index) => <article key={index}><p>{interpretation.text}</p><div><span>支持依据：</span>{sourceButton(interpretation.supporting_source_ids, '查看支持依据')}</div><div><span>相反依据：</span>{sourceButton(interpretation.counter_source_ids, '查看相反依据')}</div></article>)}</div>}
        {!!change.missing_evidence.length && <div className="jw-research-limits"><h5>变化仍需核对</h5><ul>{change.missing_evidence.map((missing, index) => <li key={index}>{missing}</li>)}</ul></div>}
      </li>)}</ol> : <p className="jw-research-missing">本次未形成可展示的变化记录，不代表企业没有变化。</p>}
      <p>{report.counter_search_status || '本次未返回相反信息的检索状态。'}</p>
      {!!report.counter_source_ids.length && sourceButton(report.counter_source_ids, '查看回应与反证')}
    </section>

    <ConsumerOutlook report={report} sourceButton={sourceButton} />

    <section className="jw-research-section" aria-label="调查后续问题">
      <h3>根据这次调查，继续核对</h3>
      {report.questions.length ? <ol className="jw-research-questions">{report.questions.map((question, index) => <li key={index}>{question}</li>)}</ol> : <p className="jw-research-missing">本次未返回进一步核对的问题。</p>}
      {!!report.unknowns.length && <div className="jw-research-limits"><h4>仍未知道的事</h4><ul>{report.unknowns.map((unknown, index) => <li key={index}>{unknown}</li>)}</ul></div>}
    </section>
  </div>;
}
