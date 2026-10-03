import { useEffect, useState, type RefObject } from 'react';

export function useJianweiMotion(ref: RefObject<HTMLElement | null>, paused = false) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const stage = ref.current;
    if (!stage) return;
    const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    let visible = typeof IntersectionObserver === 'undefined';
    const sync = () => setPlaying(visible && !paused && !media?.matches && !document.hidden);
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    }, { rootMargin: '80px' });
    observer?.observe(stage);
    media?.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {
      observer?.disconnect();
      media?.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [ref, paused]);
  return playing;
}

/** Each frame references different vector paths; the outer illustration never moves. */
export function useJianweiVectorFrame(ref: RefObject<HTMLElement | null>, frameCount: number, durationMs: number, paused = false, phaseMs = 0) {
  const playing = useJianweiMotion(ref, paused);
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!playing) { setFrame(0); return; }
    const start = performance.now();
    const update = () => setFrame(Math.floor(((performance.now() - start + phaseMs) % durationMs) / durationMs * frameCount));
    update();
    const timer = window.setInterval(update, Math.min(durationMs / frameCount, 100));
    return () => window.clearInterval(timer);
  }, [playing, frameCount, durationMs, phaseMs]);
  return { frame, playing };
}
