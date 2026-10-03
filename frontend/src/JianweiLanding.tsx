import { useEffect, useState, type CSSProperties } from 'react';
import { JianweiPerson, JianweiTeam } from './JianweiPeople';
import { JianweiObserverVideo } from './JianweiObserverVideo';
import { JianweiOutlineText } from './JianweiOutlineText';
import { JianweiPhoneStory } from './JianweiPhoneStory';
import { JianweiArchiveCabinet } from './JianweiArchiveCabinet';
import { JianweiFinanceNotes } from './JianweiFinanceNotes';
import { JianweiMagnifierStage } from './JianweiMagnifierStage';
import { JianweiDate } from './JianweiDate';

const Arrow = () => <span aria-hidden="true">↗</span>;

const clamp = (value: number) => Math.max(0, Math.min(1, value));

function usePaperMotion() {
  useEffect(() => {
    const shell = document.querySelector<HTMLElement>('.consumer-shell');
    if (!shell || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const passages = Array.from(shell.querySelectorAll<HTMLElement>('[data-jw-reveal]'));
    const hero = shell.querySelector<HTMLElement>('.jw-hero');
    let frame = 0;
    const update = () => {
      frame = 0;
      const height = window.innerHeight;
      passages.forEach(passage => {
        const rect = passage.getBoundingClientRect();
        const progress = media.matches ? 1 : clamp((height * .88 - rect.top) / (rect.height + height * .24));
        passage.style.setProperty('--read', progress.toFixed(4));
      });
      if (hero) {
        const progress = media.matches ? 0 : clamp(-hero.getBoundingClientRect().top / (height * 1.1));
        hero.style.setProperty('--journey', progress.toFixed(4));
        hero.style.setProperty('--orbit-x', `${Math.sin(progress * Math.PI * 1.45) * -180}px`);
        hero.style.setProperty('--orbit-y', `${progress * height * 1.02}px`);
        hero.style.setProperty('--orbit-turn', `${progress * 320 - 14}deg`);
        hero.style.setProperty('--orbit-scale', `${1 - progress * .52}`);
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    media.addEventListener('change', schedule);
    const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    resize?.observe(shell);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      media.removeEventListener('change', schedule);
      resize?.disconnect();
    };
  }, []);
}

function ReadingPassage({ lines, className = '', as: Tag = 'p' }: { lines: string[]; className?: string; as?: 'p' | 'span' }) {
  let index = 0;
  const count = lines.join('').length;
  return <Tag className={`jw-reading ${className}`} data-jw-reveal style={{ '--count': count } as CSSProperties}>
    <span className="jw-sr-only">{lines.join('')}</span>
    {lines.map((line, lineIndex) => <span className="jw-reading-line" key={lineIndex} aria-hidden="true">
      {Array.from(line).map(letter => <span className="jw-letter" data-letter={letter} key={index} style={{ '--i': index++ } as CSSProperties}>{letter}</span>)}
    </span>)}
  </Tag>;
}

export function JianweiHeader({ path = window.location.pathname }: { path?: string }) {
  const [active, setActive] = useState('top');
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) setActive(entry.target.id); });
    }, { rootMargin: '-12% 0px -55% 0px' });
    ['top', 'intro', 'investigate'].forEach(id => {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    });
    return () => observer.disconnect();
  }, [path]);
  return <header className="jw-header">
    <a className="jw-brand" href="/#top" aria-label="见微首页"><strong>见微</strong><em>See The Change</em></a>
    <nav aria-label="主导航">
      <a href="/#intro" className={path === '/' && ['top', 'intro'].includes(active) ? 'is-active' : ''}>Intro</a>
      <a href="/investigations/new" className={path.startsWith('/investigations/') || path === '/' && active === 'investigate' ? 'is-active' : ''}>search</a>
      <a href="/method" className={path === '/method' ? 'is-active' : ''}>method</a>
    </nav>
    <a className="jw-header-action" href="/investigations/new" aria-label="观察查，免费"><span className="jw-header-action-label">观察查 <Arrow/></span><sup>￥0</sup></a>
  </header>;
}

export function JianweiHero() {
  usePaperMotion();
  return <section className="jw-hero jw-blueprint-hero" id="top" aria-label="见微 · MICROINSIGHT">
    <JianweiFinanceNotes/>
    <p className="jw-kicker">从细微处，看见变化</p>
    <JianweiMagnifierStage>
      <div className="jw-observer" aria-hidden="true"><JianweiObserverVideo/></div>
    </JianweiMagnifierStage>
    <div className="jw-hero-byline"><em>见微</em><span>· 一次从名字开始的查证</span></div>
    <p className="jw-hero-context">办卡前，先看清这家店。</p>
    <a className="jw-scroll" href="#intro" aria-label="向下阅读 Intro">
      <span className="jw-scroll-arc" aria-hidden="true">{Array.from('scroll').map((letter, index) => {
        const degrees = -67 + index * 26.8;
        const radians = degrees * Math.PI / 180;
        return <i key={index} style={{ left: `${45 + 38 * Math.sin(radians)}px`, top: `${45 - 38 * Math.cos(radians)}px`, transform: `rotate(${degrees}deg)` }}>{letter}</i>;
      })}</span>
      <svg viewBox="0 0 40 62" aria-hidden="true"><rect x="7" y="3" width="26" height="43" rx="13"/><path d="M20 4v18M15 54l5 5 5-5"/><rect className="jw-mouse-wheel" x="18" y="11" width="4" height="9" rx="2"/></svg>
    </a>
  </section>;
}
export function JianweiIntro() {
  return <section className="jw-intro" id="intro">
    <div className="jw-section-meta"><strong>见微 · Intro</strong><span>细微之处，藏着答案。</span><em>让证据说话。</em><JianweiDate/></div>
    <div className="jw-manifesto">
      <JianweiFinanceNotes variant="intro"/>
      <div className="jw-passage-stage"><ReadingPassage lines={['一块招牌，还不是全部。', '一条评价，一次变更，', '一份被忽略的公告，', '都可能是故事的另一面。']}/><div className="jw-passage-illustration jw-passage-illustration--left"><JianweiPerson role="detective" className="jw-margin-person jw-margin-person-left"/><span className="jw-hand-note jw-note-left">别急着下结论 ↗</span></div></div>
      <div className="jw-passage-stage jw-manifesto-second"><ReadingPassage className="jw-reading-green" lines={['见微，把零散的线索', '串成有出处的记录。', '从看见变化，到核对出处，', '让每一个问题，都有所回应。']}/><div className="jw-passage-illustration jw-passage-illustration--right"><JianweiPerson role="connector" className="jw-margin-person jw-margin-person-right"/><span className="jw-hand-note jw-note-right">找到背后的联系 ↙</span></div></div>
    </div>
    <a className="jw-text-link" href="/investigations/new">从你在意的那家店开始 <Arrow/></a>
    <div className="jw-office-story" id="archive"><JianweiFinanceNotes variant="archive"/><div className="jw-office-copy"><span className="jw-hand-note">不只看表面。</span><h2>招牌背后，<br/>还有一家公司。</h2><p>打开见微的档案柜，翻一翻企业档案、关联关系与公开线索。你在意的细节，都值得被看见。</p><JianweiPerson role="analyst" className="jw-office-analyst"/></div><JianweiArchiveCabinet/></div>
  </section>;
}

export function JianweiAbout() {
  usePaperMotion();
  return <>
    <section className="jw-about" id="about">
      <div className="jw-section-meta"><strong>关于见微 · The way we see</strong><span>从微小线索，到完整视角。</span><span>03 — 03</span></div>
      <JianweiPhoneStory/>
      <div className="jw-faq"><p className="jw-faq-label">Before you begin.<br/><span>你可能想知道</span></p><div>
        <details><summary>见微能帮助我判断什么？<span aria-hidden="true">＋</span></summary><p>综合本次找到的经营、履约与消费反馈资料，给出低、中、高风险初判、判断理由和付款建议。适用于办卡、买课、充值与续费前的资料研究。</p></details>
        <details><summary>每一个判断，都能找到依据吗？<span aria-hidden="true">＋</span></summary><p>风险判断卡提供引文、来源链接与资料时间。搜索摘要、网页正文和接口资料都可参与初判，并保留各自的来源类型；品牌背景与所选公司资料分别呈现，支持和相反信息一并保留。</p></details>
        <details><summary>查不到资料意味着什么？<span aria-hidden="true">＋</span></summary><p>没有可用资料时，按中风险给出控制预付的建议，这是付款策略，不表示企业已有经营问题。已有资料持续支持经营稳定时，可以判断为低风险。结论基于本次资料，不是付款保证。</p></details>
      </div></div>
    </section>
  </>;
}

export function JianweiHomeClosing() {
  return <>
    <JianweiTeam/>
    <section className="jw-claim"><JianweiFinanceNotes variant="closing"/><p>在你作出下一个决定之前。</p><h2><JianweiOutlineText/></h2><JianweiPerson role="guardian" className="jw-claim-guardian"/><span className="jw-claim-mark" aria-hidden="true">↗</span></section>
  </>;
}

export function JianweiFooter({ pageTop = '/#top' }: { pageTop?: string }) {
  return <footer className="jw-footer"><div className="jw-footer-top"><a href="/#top" className="jw-footer-brand">见微<span>See The Change.</span></a><nav aria-label="页脚导航"><a href="/investigations/new">观察查</a><a href="/story">一次查证</a><a href="/method">方法与边界</a></nav></div><div className="jw-footer-bottom"><span>© {new Date().getFullYear()} 见微</span><span>从细微变化，找到查证的线索。</span><a href={pageTop}>回到顶部 ↑</a></div></footer>;
}


