import { useEffect, useRef, useState } from 'react';
import { JianweiPhoneDevice } from './JianweiPhoneDevice';
import { JianweiPhoneScenery } from './JianweiPhoneScenery';
import './jianwei-phone-story.css';

const chapters = [
  { label: '认清主体', eyebrow: '01 / START WITH A NAME', title: <>一个名字，<br/>是查证的开始。</>, description: '招牌、品牌、收款方，可能不是同一家公司。先确认你在意的那家店，背后究竟是谁。', detail: '门店名称 → 经营主体' },
  { label: '追溯线索', eyebrow: '02 / FOLLOW THE EVIDENCE', title: <>每条线索，<br/>都有迹可循。</>, description: '把公告、经营变化与消费反馈放在一起看。综合时间、主体关联和正反面信息，形成有依据的风险判断。', detail: '公开资料 → 风险初判与依据' },
];

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const mix = (start: number, end: number, progress: number) => start + (end - start) * progress;

/** Scroll controls the pose and story in both directions; no timer or scroll hijacking. */
export function JianweiPhoneStory() {
  const story = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [chapter, setChapter] = useState<0 | 1>(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenMessage, setFullscreenMessage] = useState('');

  useEffect(() => {
    const updateFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', updateFullscreen);
    return () => document.removeEventListener('fullscreenchange', updateFullscreen);
  }, []);

  useEffect(() => {
    const root = story.current, stage = viewport.current;
    if (!root || !stage || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0, current = 0, target = 0;
    let mobile = false, scale = 1, travelX = 0, travelY = 0;
    const measure = () => {
      mobile = window.innerWidth <= 760;
      const width = document.documentElement.clientWidth;
      root.style.setProperty('--phone-stage-width', `${width}px`);
      const stageHeight = stage.clientHeight;
      const sceneTop = mobile ? (stageHeight < 660 ? 176 : 190) : 0;
      const sceneHeight = mobile ? stageHeight - sceneTop - 76 : stageHeight;
      scale = mobile
        ? Math.min((sceneHeight - 48) / 610, width * .56 / 300)
        : Math.min((stageHeight - 180) / 610, width * .34 / 300, 1.6);
      scale = Math.max(.22, scale);
      stage.style.setProperty('--phone-size', String(scale));
      stage.style.setProperty('--phone-center-y', `${sceneTop + sceneHeight / 2 - (mobile ? 0 : 20)}px`);
      travelX = Math.max(1, Math.min(width * (mobile ? .23 : .24), (width - 300 * scale) / 2 - 22));
      travelY = mobile ? 20 : Math.min(30, stageHeight * .035);
      const bounds = root.getBoundingClientRect();
      root.dataset.inView = String(bounds.top <= 1 && bounds.bottom >= stageHeight - 1);
      target = clamp(-bounds.top / Math.max(1, root.offsetHeight - stageHeight));
    };
    const draw = () => {
      frame = 0;
      current = media.matches ? target : mix(current, target, .16);
      if (Math.abs(target - current) < .0005) current = target;
      // Hold each composition briefly; use the whole viewport for the journey.
      const segment = clamp((current - .06) / .88);
      const eased = segment * segment * (3 - 2 * segment);
      const pose = { x: mix(-travelX, travelX, eased), y: mix(travelY, -travelY, eased), ry: mix(32, -26, eased) };
      const nextChapter = current < .5 ? 0 : 1;
      const snap = (value: number) => Math.round(value * window.devicePixelRatio) / window.devicePixelRatio;
      stage.style.setProperty('--phone-x', `${media.matches ? (mobile ? 0 : -travelX) : snap(pose.x)}px`);
      stage.style.setProperty('--phone-y', `${media.matches ? 0 : snap(pose.y)}px`);
      stage.style.setProperty('--phone-ry', `${media.matches ? 0 : pose.ry}deg`);
      stage.style.setProperty('--phone-copy-opacity', String(mobile || media.matches ? 1 : clamp((Math.abs(pose.x) / travelX - .48) / .38)));
      stage.style.setProperty('--phone-progress', String(current));
      setChapter(nextChapter);
      if (current !== target) frame = requestAnimationFrame(draw);
    };
    const schedule = () => { measure(); if (!frame) frame = requestAnimationFrame(draw); };
    measure(); current = target; draw();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    media.addEventListener('change', schedule);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    observer?.observe(root); observer?.observe(stage);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      media.removeEventListener('change', schedule);
      observer?.disconnect();
    };
  }, []);

  const goToChapter = (index: number) => {
    if (!story.current || !viewport.current) return;
    const top = parseFloat(getComputedStyle(viewport.current).top) || 0;
    const distance = story.current.offsetHeight - viewport.current.offsetHeight;
    window.scrollTo({ top: window.scrollY + story.current.getBoundingClientRect().top - top + distance * index, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };

  const toggleFullscreen = async () => {
    setFullscreenMessage('');
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        await document.documentElement.requestFullscreen();
        story.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
      }
    } catch {
      setFullscreenMessage('当前浏览器未开启全屏，可展开预览窗口观看。');
    }
  };

  return <div className="jw-phone-story" ref={story} id="phone-demo" aria-label="见微查证流程手机演示">
    <div className="jw-phone-stage" ref={viewport} data-chapter={chapter}>
      {document.fullscreenEnabled && <button className="jw-phone-fullscreen" type="button" onClick={toggleFullscreen}>{fullscreen ? '退出全屏' : '全屏观看'} <span aria-hidden="true">⤢</span></button>}
      {fullscreenMessage && <p className="jw-phone-fullscreen-message" role="status">{fullscreenMessage}</p>}
      <div className="jw-phone-scene">
        <JianweiPhoneScenery stage={chapter}/>
        <span className="jw-phone-scene-label">MICROINSIGHT / A CLOSER LOOK</span>
        <div className="jw-phone-perspective"><div className="jw-phone-pose"><JianweiPhoneDevice stage={chapter}/></div></div>
        <div className="jw-phone-shadow" aria-hidden="true"/>
        <span className="jw-phone-scene-caption">产品流程演示 · 非真实企业数据</span>
      </div>
      <div className="jw-phone-narrative">
        <div className="jw-phone-chapters">
          {chapters.map((item, index) => <article key={item.label} className="jw-phone-chapter" data-active={chapter === index} aria-hidden={chapter !== index}>
            <p className="jw-phone-eyebrow">{item.eyebrow}</p>
            <h2>{item.title}</h2><p className="jw-phone-description">{item.description}</p>
            <p className="jw-phone-detail"><span aria-hidden="true">↳</span>{item.detail}</p>
          </article>)}
        </div>
        <a className="jw-phone-cta" href="/investigations/new">开始一次查证 <span aria-hidden="true">↗</span></a>
      </div>
      <nav className="jw-phone-chapter-nav" aria-label="手机演示步骤">
        {chapters.map((item, index) => <button type="button" key={item.label} aria-current={chapter === index ? 'step' : undefined} onClick={() => goToChapter(index)}><span>0{index + 1}</span>{item.label}</button>)}
      </nav>
      <div className="jw-phone-scroll-hint" aria-hidden="true"><span>SCROLL TO DISCOVER</span> ↓</div>
    </div>
  </div>;
}
