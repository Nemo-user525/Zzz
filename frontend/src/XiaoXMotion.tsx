import { useCallback, useEffect, useRef, useState } from 'react';
import { createPaperMatte } from './xiaoxTransparency';
import './xiaox-motion.css';

export type XiaoXActivity = 'idle' | 'searching' | 'thinking' | 'reviewing' | 'complete' | 'listening' | 'attention';

type XiaoXMotionProps = {
  activity: XiaoXActivity;
  className?: string;
};

const HERO = '/images/xiaox-hero-transparent.png';
const CLIPS = {
  searching: '/videos/xiaox/searching.mp4',
  papers: '/videos/xiaox/sorting-clues.mp4',
  camera: '/videos/xiaox/photographing-evidence.mp4',
  complete: '/videos/xiaox/presenting-report.mp4',
};

// Waiting shows the whole character repertoire; active work uses relevant actions.
const PLAYLISTS: Record<XiaoXActivity, readonly string[]> = {
  idle: [CLIPS.searching, CLIPS.papers, CLIPS.camera, CLIPS.complete],
  searching: [CLIPS.searching, CLIPS.camera],
  thinking: [CLIPS.papers, CLIPS.camera],
  reviewing: [CLIPS.papers, CLIPS.camera],
  complete: [CLIPS.complete],
  listening: [CLIPS.searching],
  attention: [CLIPS.searching],
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

type MotionScene = { activity: XiaoXActivity; src: string; finished: boolean };

function isInteractive(activity: XiaoXActivity) {
  return activity === 'listening' || activity === 'attention';
}

function nextScene(activity: XiaoXActivity, previous?: MotionScene): MotionScene {
  const playlist = PLAYLISTS[activity];
  let src = playlist[0];
  // Reuse an action across phases; if it has already ended, continue with the next.
  if (src === previous?.src && previous.finished && playlist.length > 1) src = playlist[1];
  return { activity, src, finished: Boolean(src === previous?.src && previous.finished) };
}

/** Finish the current clip, then apply only the latest requested workflow phase. */
function useMotionSequence(activity: XiaoXActivity, enabled: boolean) {
  const [scene, setScene] = useState<MotionScene>(() => nextScene(activity));
  const requested = useRef(activity);
  requested.current = activity;
  useEffect(() => {
    if (activity === scene.activity) return;
    const immediate = !enabled || isInteractive(activity) || isInteractive(scene.activity)
      || (!scene.finished && PLAYLISTS[activity][0] === scene.src);
    if (immediate) { setScene(current => nextScene(activity, current)); return; }
    if (scene.src && !scene.finished) return;
    const timer = window.setTimeout(() => setScene(current => nextScene(activity, current)), 350);
    return () => window.clearTimeout(timer);
  }, [activity, enabled, scene]);

  const finish = useCallback((src: string, failed: boolean) => {
    setScene(current => {
      if (current.src !== src || current.finished) return current;
      const completed = { ...current, finished: true };
      if (requested.current !== current.activity) return nextScene(requested.current, completed);
      const playlist = PLAYLISTS[current.activity];
      if (!failed && playlist.length > 1) {
        return { ...current, src: playlist[(playlist.indexOf(src) + 1) % playlist.length] };
      }
      return completed;
    });
  }, []);
  return { scene, finish };
}

/** Only the canvas is visible: the source video can never expose its paper. */
function MotionVideo({ src, active, onFinish }: {
  src: string;
  active: boolean;
  onFinish: (src: string, failed: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !active) return;
    let mounted = true;
    let running = false;
    let settled = false;
    let callbackId: number | null = null;
    let lastDraw = -Infinity;
    let loadTimer: number | undefined;
    const size = 240;
    const matte = createPaperMatte(size, size);
    // Never clear the displayed frame while a new clip loads or produces a blank frame.
    const scratch = document.createElement('canvas');
    scratch.width = scratch.height = size;
    let context: CanvasRenderingContext2D | null = null;
    let output: CanvasRenderingContext2D | null = null;
    try {
      output = canvas.getContext('2d', { alpha: true });
      context = scratch.getContext('2d', { alpha: true, willReadFrequently: true });
    } catch { /* Keep the last valid frame or transparent portrait. */ }
    if (!context || !output) { onFinish(src, true); return; }

    const cancelFrame = () => {
      if (callbackId === null) return;
      if (typeof video.cancelVideoFrameCallback === 'function') video.cancelVideoFrameCallback(callbackId);
      else window.cancelAnimationFrame(callbackId);
      callbackId = null;
    };
    const settle = (failed: boolean) => {
      if (!mounted || settled) return;
      settled = true;
      running = false;
      window.clearTimeout(loadTimer);
      cancelFrame();
      video.pause();
      onFinish(src, failed);
    };
    const fail = () => settle(true);
    const ended = () => settle(false);
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
          if (containsArt) {
            output.putImageData(frame, 0, 0);
            if (loadTimer !== undefined) {
              window.clearTimeout(loadTimer);
              loadTimer = undefined;
              setRendered(true);
            }
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
      if (!mounted || running || settled) return;
      running = true;
      drawFrame(performance.now());
    };

    video.addEventListener('playing', start);
    video.addEventListener('error', fail);
    video.addEventListener('ended', ended);
    video.muted = true;
    // Only a failed load times out; elapsed wall time never advances a playing clip.
    loadTimer = window.setTimeout(fail, 10000);
    try { video.play()?.then(start).catch(fail); } catch { fail(); }
    return () => {
      mounted = false;
      running = false;
      window.clearTimeout(loadTimer);
      cancelFrame();
      video.removeEventListener('playing', start);
      video.removeEventListener('error', fail);
      video.removeEventListener('ended', ended);
      video.pause();
    };
  }, [src, active, onFinish]);

  return <>
    <span className={'jw-xiaox-motion-poster' + (rendered ? ' is-hidden' : '')}><Hero/></span>
    <canvas ref={canvasRef} width={240} height={240} className={'jw-xiaox-motion-canvas' + (rendered ? ' is-playing' : '')}/>
    <video
      key={src}
      ref={videoRef}
      className="jw-xiaox-motion-source"
      src={src}
      hidden
      muted
      playsInline
      preload="metadata"
      tabIndex={-1}
      disablePictureInPicture
    />
  </>;
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
  const { scene, finish } = useMotionSequence(activity, !reduced);
  const motionActivity = scene.activity;
  let performance;
  if (reduced) {
    performance = <Hero/>;
  } else {
    performance = <MotionVideo src={scene.src} active={visible && !scene.finished} onFinish={finish}/>;
  }

  return <span
    ref={wrapper}
    className={`jw-xiaox-motion is-${motionActivity}${reduced || !visible ? ' is-reduced-motion' : ''}${className ? ` ${className}` : ''}`}
    data-activity={activity}
    data-motion-activity={motionActivity}
    data-motion-finished={scene.finished}
    aria-hidden="true"
  >
    {performance}
  </span>;
}
