import type { CSSProperties, ReactNode } from 'react';
import './jianwei-phone-device.css';

type PhoneStage = 0 | 1 | 2;
type IconName = 'chat' | 'source' | 'check' | 'building' | 'change' | 'message' | 'arrow' | 'search' | 'spark';

function PhoneIcon({ name, className = '' }: { name: IconName; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    chat: <><path d="M20 11.5a8 8 0 0 1-8 8H4l1.3-4A8 8 0 1 1 20 11.5Z" /><path d="M8 10h8M8 14h5" /></>,
    source: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
    check: <><rect x="4" y="4" width="16" height="16" rx="5" /><path d="m8 12 3 3 5-6" /></>,
    building: <><path d="M5 21V5h14v16M2 21h20M9 21v-5h6v5M9 9h1m4 0h1m-6 3h1m4 0h1" /></>,
    change: <><path d="M4 7h14m-3-3 3 3-3 3M20 17H6m3 3-3-3 3-3" /></>,
    message: <><path d="M20 15a2 2 0 0 1-2 2H9l-5 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2Z" /><path d="M8 8h8M8 12h5" /></>,
    arrow: <><path d="M6 18 18 6M6 6h12v12" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
    spark: <><path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3Z" /></>,
  };
  return <svg className={`jw-phone-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function ScreenHeader({ step }: { step: string }) {
  return <div className="jw-phone-brand"><span className="jw-phone-brand-name"><span className="jw-phone-brand-mark" aria-hidden="true">微</span>见微</span><span className="jw-phone-demo">{step} · 示意</span></div>;
}

export function JianweiPhoneDevice({ stage }: { stage: PhoneStage }) {
  const sources: { icon: IconName; title: string; body: string; origin: string }[] = [
    { icon: 'building', title: '经营主体', body: '门店、合同与收款方是否一致？', origin: '工商公示 · 待核对' },
    { icon: 'change', title: '公开变化', body: '把变更记录放回时间线上。', origin: '公开记录 · 待核对' },
    { icon: 'message', title: '消费反馈', body: '保留来源，区分反馈与事实。', origin: '用户反馈 · 待核实' },
  ];
  return (
    <div className="jw-phone" role="group" aria-label="见微产品流程手机演示">
      {/* Aligned sections of one chassis: depth comes from Z, never a sideways offset. */}
      <div className="jw-phone-chassis" aria-hidden="true">
        {Array.from({ length: 25 }, (_, depth) => <span className="jw-phone-metal-slice" key={depth} style={{ '--shell-depth': `${-depth}px` } as CSSProperties}/>)}
      </div>
      <div className="jw-phone-side jw-phone-side-silent" aria-hidden="true" />
      <div className="jw-phone-side jw-phone-side-volume-up" aria-hidden="true" />
      <div className="jw-phone-side jw-phone-side-volume-down" aria-hidden="true" />
      <div className="jw-phone-side jw-phone-side-power" aria-hidden="true" />
      <div className="jw-phone-frame">
        <div className="jw-phone-screen">
          <div className="jw-phone-status" aria-hidden="true">
            <span>9:41</span>
            <div className="jw-phone-status-right"><span className="jw-phone-signal"><i /><i /><i /><i /></span><svg viewBox="0 0 18 14"><path d="M2 4a11 11 0 0 1 14 0M5 7a6.5 6.5 0 0 1 8 0M8 10a2 2 0 0 1 2 0" /></svg><span className="jw-phone-battery" /></div>
          </div>
          <div className="jw-phone-island" aria-hidden="true"><i /></div>
          <div className="jw-phone-screen-content">
            <section className="jw-phone-page jw-phone-page-chat" data-active={stage === 0} aria-hidden={stage !== 0} aria-label="第一步，提出问题">
              <ScreenHeader step="01" />
              <h3 className="jw-phone-title">办卡之前，<br />先看清。</h3>
              <p className="jw-phone-intro">从你在意的一个问题开始。</p>
              <div className="jw-phone-user-bubble">这家健身房，可以办年卡吗？</div>
              <div className="jw-phone-reply">
                <span className="jw-phone-reply-icon"><PhoneIcon name="spark" /></span>
                <p>先不急着下结论。<br />我们从它背后的经营主体查起。</p>
              </div>
              <div className="jw-phone-entity">
                <span className="jw-phone-entity-icon"><PhoneIcon name="building" /></span>
                <div><strong>先确认，钱付给谁</strong><p>门店名称 → 合同主体 → 收款方</p></div>
                <PhoneIcon name="arrow" />
              </div>
              <p className="jw-phone-footnote">演示问题 · 非真实商家调查</p>
            </section>

            <section className="jw-phone-page jw-phone-page-sources" data-active={stage === 1} aria-hidden={stage !== 1} aria-label="第二步，查看资料来源">
              <ScreenHeader step="02" />
              <h3 className="jw-phone-title">每条线索，<br />都有来处。</h3>
              <p className="jw-phone-intro">连接资料，也保留它的边界。</p>
              <div className="jw-phone-sources">
                {sources.map((source, index) => <div className="jw-phone-source" key={source.title}>
                  <div className="jw-phone-source-top"><span className="jw-phone-source-icon"><PhoneIcon name={source.icon} /></span><strong>{source.title}</strong><span className="jw-phone-source-number">0{index + 1}</span></div>
                  <p>{source.body}</p>
                  <span className="jw-phone-source-origin"><i />{source.origin}<span>示意</span></span>
                </div>)}
              </div>
              <p className="jw-phone-footnote">来源不同，不代表已经相互印证。</p>
            </section>

            <section className="jw-phone-page jw-phone-page-summary" data-active={stage === 2} aria-hidden={stage !== 2} aria-label="第三步，付款前核对">
              <ScreenHeader step="03" />
              <h3 className="jw-phone-title">付款前<br />核对卡。</h3>
              <p className="jw-phone-intro">把不确定，变成可以问清的问题。</p>
              <div className="jw-phone-checklist">
                <div className="jw-phone-check-row"><span className="jw-phone-check-symbol"><PhoneIcon name="check" /></span><div><span className="jw-phone-check-label">已知 / YOUR QUESTION</span><strong>你准备办理一张年卡</strong><p>长期预付，值得多核对一步。</p></div></div>
                <div className="jw-phone-check-row"><span className="jw-phone-check-symbol jw-phone-check-unknown">?</span><div><span className="jw-phone-check-label">待核实 / STILL UNKNOWN</span><strong>合同与实际履约情况</strong><p>仅凭公开资料，还不能判断。</p></div></div>
                <div className="jw-phone-next-question"><span className="jw-phone-check-label">下一步，向商家问清</span><p>谁签合同？谁收款？<br />停业后，剩余费用怎么退？</p><PhoneIcon name="arrow" /></div>
              </div>
              <p className="jw-phone-footnote">流程演示 · 不构成对任何商家的结论</p>
            </section>
          </div>
          <div className="jw-phone-dock" aria-hidden="true">
            <div className="jw-phone-input"><PhoneIcon name="search" /><span>输入你想了解的商家…</span><PhoneIcon name="spark" /></div>
            <div className="jw-phone-nav">
              {([{ icon: 'chat', label: '提问' }, { icon: 'source', label: '线索' }, { icon: 'check', label: '核对' }] as const).map((item, index) => <div className="jw-phone-nav-item" data-active={stage === index} key={item.label}><PhoneIcon name={item.icon} /><span>{item.label}</span></div>)}
            </div>
            <div className="jw-phone-home" />
          </div>
          <div className="jw-phone-glass" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
