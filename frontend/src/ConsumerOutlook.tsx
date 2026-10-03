import type { ReactNode } from 'react';
import type { RiskAnalysis } from './api/consumer';

const sentimentLabel:Record<string,string>={positive:'正面',negative:'负面',mixed:'褒贬混合',unclear:'不明确'};
const number=(value:number)=>value.toLocaleString('zh-CN',{maximumFractionDigits:2});
const range=(low:number,high:number)=>low===high?number(low):`${number(low)} ～ ${number(high)}`;
const percent=(value:number)=>`${value>0?'+':''}${value}%`;

export function ConsumerOutlook({report,sourceButton}:{report:RiskAnalysis;sourceButton:(ids:string[],label?:string)=>ReactNode}){
  const {reviews,cashflow,risk}=report;
  return <>
    {!!reviews?.collected_count&&<section className="consumer-panel" aria-label="用户评价评估">
      <div className="consumer-section-head"><h2>用户评价，如何影响判断</h2><span>已审阅 {reviews.reviewed_count} / {reviews.collected_count} 条材料</span></div>
      <p>{risk?.review_impact||'评价尚未完成模型评估。'}</p>
      {reviews.status==='completed'&&<><div className="review-stats">{Object.entries(sentimentLabel).map(([key,label])=><span key={key}><strong>{reviews.counts[key]||0}</strong>{label}材料</span>)}</div><p>共 {reviews.independent_content_count} 组非近似转载的评价或讨论；数量不是人数，也不是总体好评率。</p></>}
      <details><summary>逐条查看全部已审阅评价</summary>{reviews.observations.map(item=><article className="review-observation" key={item.source_id}>
        <strong>{item.kind==='non_review'?'非用户评价内容':sentimentLabel[item.sentiment]} · {item.scope==='brand_context'?'品牌／门店线索':'材料提及所选公司'}</strong>
        {item.duplicate_of&&<small> · 与另一材料近似，未重复计数</small>}<p>{item.summary}</p><blockquote>{item.quote}</blockquote>{sourceButton([item.source_id],'评价出处')}
      </article>)}</details><small>{reviews.limitation}</small>
    </section>}
    {!!cashflow?.scenarios.length&&<section className="consumer-panel" aria-label="未来收支模拟">
      <div className="consumer-section-head"><h2>未来 {cashflow.horizon_months} 个月收支情景</h2><strong>{cashflow.mode==='evidence_anchored'?'有现金收支材料作为基线':'条件压力测试 · 缺少实际收支基线'}</strong></div>
      <p>{risk?.cashflow_impact||'收支情景尚未完成模型综合评估。'}</p><p>{cashflow.baseline.description || '尚无实际收支基线'}。基线期间：{cashflow.baseline.period || '未提供'}。</p>
      <p className="consumer-message">单位：{cashflow.unit}。变化百分比是试算假设，不是对企业未来增长或亏损的预测。</p>
      <div className="outlook-table"><table><thead><tr><th>情景</th><th>第 {cashflow.horizon_months} 月收款变化</th><th>第 {cashflow.horizon_months} 月支出变化</th><th>{cashflow.horizon_months} 个月累计收支差额</th></tr></thead><tbody>{cashflow.scenarios.map(s=><tr key={s.name}><th>{s.name}</th><td>{percent(s.inflow_change_pct)}</td><td>{percent(s.outflow_change_pct)}</td><td>{range(s.cumulative_net_min,s.cumulative_net_max)}</td></tr>)}</tbody></table></div>
      <details><summary>查看逐月模拟与计算假设</summary><p>各月收款=基线收款×（1+收款变化率×月份÷{cashflow.horizon_months}）；支出同理。收支差额=收款−支出，累计值为逐月相加。区间来自不同基线支出假设，不是统计置信区间。</p>
        {cashflow.scenarios.map(s=><div key={s.name}><h3>{s.name}</h3><p>{s.assumption}</p><div className="outlook-table"><table><thead><tr><th>月份</th><th>收款</th><th>支出</th><th>收支差额</th></tr></thead><tbody>{s.months.map(m=><tr key={m.month}><th>第 {m.month} 月</th><td>{number(m.inflow)}</td><td>{range(m.outflow_min,m.outflow_max)}</td><td>{range(m.net_min,m.net_max)}</td></tr>)}</tbody></table></div></div>)}
      </details>
      {!!cashflow.facts.length&&<details><summary>核对提取的现金收支数值</summary>{cashflow.facts.map((f,i)=><p key={i}>{f.period} · {f.kind==='operating_inflow'?'经营现金流入':'经营现金流出'}：{f.amount_text}{f.unit} {sourceButton([f.citation.source_id],'数值出处')}</p>)}</details>}
      {!!cashflow.driver_source_ids.length&&sourceButton(cashflow.driver_source_ids,'可能影响收支的材料')}
      <ul>{cashflow.limitations.map(x=><li key={x}>{x}</li>)}</ul>
    </section>}
  </>;
}
