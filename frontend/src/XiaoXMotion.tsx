import { useEffect, useRef, useState } from 'react';
import { createPaperMatte } from './xiaoxTransparency';
import './xiaox-motion.css';

export type XiaoXActivity = 'idle' | 'searching' | 'thinking' | 'reviewing' | 'complete' | 'listening' | 'dancing' | 'attention';

type XiaoXMotionProps = {
  activity: XiaoXActivity;
  className?: string;
};

const HERO = '/images/xiaox-hero-transparent.png';
const DANCE_SPRITE = '/images/xiaox-dance-sprite.png';
const CLIPS = {
  searching: '/videos/xiaox/searching.mp4',
  papers: '/videos/xiaox/sorting-clues.mp4',
  camera: '/videos/xiaox/photographing-evidence.mp4',
  complete: '/videos/xiaox/presenting-report.mp4',
};

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => (
    typeof window === 'undefined' || typeof window.matchMedia !== 'function'
      ? true
      : window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ));

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  return reduced;
}

function Hero() {
  return <img className="jw-xiaox-motion-hero" src={HERO} width="1254" height="1254" alt="" draggable={false}/>;
}

/** Only the canvas is visible: the source video can never expose its paper. */
function MotionVideo({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    let mounted = true;
    let running = false;
    let failed = false;
    let callbackId: number | null = null;
    let lastDraw = -Infinity;
    let hasFrame = false;
    const size = 240;
    const matte = createPaperMatte(size, size);
    let context: CanvasRenderingContext2D | null = null;
    try { context = canvas.getContext('2d', { alpha: true, willReadFrequently: true }); } catch { /* Keep the transparent portrait. */ }
    if (!context) return;

    const cancelFrame = () => {
      if (callbackId === null) return;
      if (typeof video.cancelVideoFrameCallback === 'function') video.cancelVideoFrameCallback(callbackId);
      else window.cancelAnimationFrame(callbackId);
      callbackId = null;
    };
    const fail = () => {
      if (!mounted) return;
      failed = true;
      running = false;
      cancelFrame();
      video.pause();
      setRendered(false);
    };
    const schedule = () => {
      if (!mounted || !running) return;
      callbackId = typeof video.requestVideoFrameCallback === 'function'
        ? video.requestVideoFrameCallback(drawFrame)
        : window.requestAnimationFrame(drawFrame);
    };
    const drawFrame = (now: number) => {
      callbackId = null;
      if (!mounted || !running) return;
      if (video.readyState >= 2 && video.videoWidth && now - lastDraw >= 1000 / 12) {
        try {
          const scale = Math.min(size / video.videoWidth, size / video.videoHeight);
          const width = video.videoWidth * scale;
          const height = video.videoHeight * scale;
          context.clearRect(0, 0, size, size);
          context.drawImage(video, (size - width) / 2, (size - height) / 2, width, height);
          const frame = context.getImageData(0, 0, size, size);
          const containsArt = matte(frame.data) > 0;
          context.putImageData(frame, 0, 0);
          if (hasFrame !== containsArt) {
            hasFrame = containsArt;
            setRendered(containsArt);
          }
          lastDraw = now;
        } catch {
          fail();
          return;
        }
      }
      schedule();
    };
    const start = () => {
      if (!mounted || running || failed) return;
      running = true;
      drawFrame(performance.now());
    };

    video.addEventListener('playing', start);
    video.addEventListener('error', fail);
    video.muted = true;
    try { video.play()?.then(start).catch(fail); } catch { fail(); }
    return () => {
      mounted = false;
      running = false;
      cancelFrame();
      video.removeEventListener('playing', start);
      video.removeEventListener('error', fail);
      video.pause();
      context.clearRect(0, 0, size, size);
    };
  }, []);

  return <>
    <span className={'jw-xiaox-motion-poster' + (rendered ? ' is-hidden' : '')}><Hero/></span>
    <canvas ref={canvasRef} width={240} height={240} className={'jw-xiaox-motion-canvas' + (rendered ? ' is-playing' : '')}/>
    <video
      ref={videoRef}
      className="jw-xiaox-motion-source"
      src={src}
      hidden
      muted
      loop
      playsInline
      preload="metadata"
      tabIndex={-1}
      disablePictureInPicture
    />
  </>;
}

function ThinkingMotion() {
  const [camera, setCamera] = useState(false);
  useEffect(() => {
    const timer = window.setInterval(() => setCamera(current => !current), 7000);
    return () => window.clearInterval(timer);
  }, []);
  const src = camera ? CLIPS.camera : CLIPS.papers;
  return <MotionVideo key={src} src={src}/>;
}

function DanceMotion() {
  const [spriteLoaded, setSpriteLoaded] = useState(false);
  useEffect(() => {
    const sprite = new Image();
    sprite.onload = () => setSpriteLoaded(true);
    sprite.src = DANCE_SPRITE;
    return () => { sprite.onload = null; };
  }, []);

  return spriteLoaded
    ? <span className="jw-xiaox-motion-dance-sprite"/>
    : <span className="jw-xiaox-motion-dance-fallback"><Hero/></span>;
}

/** Decorative performance; the enclosing control supplies its accessible label. */
export function XiaoXMotion({ activity, className = '' }: XiaoXMotionProps) {
  const reduced = useReducedMotion();
  const wrapper = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    let inViewport = true;
    const update = () => setVisible(inViewport && document.visibilityState !== 'hidden');
    const observer = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(entries => {
        inViewport = entries.some(entry => entry.isIntersecting);
        update();
      }, { rootMargin: '48px' })
      : null;
    if (wrapper.current) observer?.observe(wrapper.current);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  let performance;
  if (reduced || !visible) {
    performance = <Hero/>;
  } else if (activity === 'thinking') {
    performance = <ThinkingMotion/>;
  } else if (activity === 'dancing') {
    performance = <DanceMotion/>;
  } else {
    const src = activity === 'searching' ? CLIPS.searching
      : activity === 'reviewing' ? CLIPS.papers
      : activity === 'complete' ? CLIPS.complete
      : null;
    performance = src ? <MotionVideo key={src} src={src}/> : <Hero/>;
  }

  return <span
    ref={wrapper}
    className={`jw-xiaox-motion is-${activity}${reduced || !visible ? ' is-reduced-motion' : ''}${className ? ` ${className}` : ''}`}
    data-activity={activity}
    aria-hidden="true"
  >
    {performance}
    {activity === 'listening' && <span className="jw-xiaox-motion-listening"><i/><i/><i/></span>}
    {activity === 'attention' && <span className="jw-xiaox-motion-attention">?</span>}
  </span>;
}
