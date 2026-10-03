import type { ReactNode } from 'react';
import { XiaoXMotion, type XiaoXActivity } from './XiaoXMotion';
import './xiaox-agent.css';

type XiaoXAgentProps = {
  children: ReactNode;
  feedback: ReactNode;
  busy: boolean;
  activity?: XiaoXActivity;
  query: string;
  standalone?: boolean;
};

export function XiaoXAgent({ children, feedback, busy, query, activity, standalone = false }: XiaoXAgentProps) {
  const Heading = standalone ? 'h1' : 'h2';

  return <section className={'jw-xiaox-agent' + (busy ? ' is-searching' : '')} aria-labelledby="jw-agent-title">
    <div className="jw-agent-intro">
      <p className="jw-agent-eyebrow">观察查 <span>/</span> YOUR AI AGENT</p>
      <Heading id="jw-agent-title" tabIndex={-1}>你好，我是<span>小 X。</span></Heading>
      <p className="jw-agent-intro-copy">复杂的世界里，<br/>我陪你多看一眼。</p>
      <div className="jw-agent-decoration" aria-hidden="true">
        <XiaoXMotion activity={activity ?? (busy ? 'searching' : 'idle')}/>
      </div>
    </div>
    <div className="jw-agent-desk">
      <div className="jw-agent-card">
        <div className="jw-agent-card-top"><span>小 X <b>AI AGENT</b></span><span className="jw-agent-state"><i aria-hidden="true"/>{busy ? '查证中' : '等你提供线索'}</span></div>
        <div className="jw-agent-message">
          <h3>{busy ? '我去找找，这家店的线索。' : '这次，我们查哪一家？'}</h3>
          <p>{busy ? `正在检索「${query.trim()}」的公开资料。找到候选公司后，我们一起核对是不是同一家。` : '告诉我门店、品牌或公司的名字。我会先找经营主体，再陪你核对公开证据。'}</p>
        </div>
        {children}
        {feedback}
      </div>
      <ol className="jw-agent-plan" aria-label="小 X 的查证流程">
        <li><span>01</span>找对经营主体</li><li><span>02</span>沿来源看证据</li><li><span>03</span>带走核对卡</li>
      </ol>
      <p className="jw-agent-footnote">有出处的线索，才值得多看一眼。</p>
    </div>
  </section>;
}
