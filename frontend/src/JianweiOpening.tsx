import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import './jianwei-finance-notes.css';
import './jianwei-opening.css';

const annotations = [
  { label: 'ROE', x: 16, y: 21, angle: -11, delay: 0.1 },
  { label: 'EPS', x: 81, y: 24, angle: 8, delay: 0.55 },
  { label: 'FCF', x: 9, y: 51, angle: -6, delay: 0.85 },
  { label: 'P/E', x: 91, y: 53, angle: 10, delay: 0.3 },
  { label: 'IRR', x: 27, y: 87, angle: -9, delay: 0.65 },
  { label: 'NPV', x: 76, y: 84, angle: 7, delay: 1.0 },
];

export function shouldShowOpening(path = window.location.pathname) {
  return (path === '/' || path === '/index.html') &&
    !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** A brief welcome, independent of network loading or research progress. */
export function JianweiOpening({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState<'playing' | 'leaving'>('playing');
  const video = useRef<HTMLVideoElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const exiting = useRef(false);
  const complete = useRef(onComplete);
  complete.current = onComplete;
  const leave = useCallback(() => {
    if (exiting.current) return;
    exiting.current = true;
    setPhase('leaving');
  }, []);

  useEffect(() => {
    const overflow = document.body.style.overflow;
    const focused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus({ preventScroll: true });
    // Muted inline playback also works when browsers block audible autoplay.
    video.current?.play()?.catch(leave);
    // Only a stalled or unavailable video needs this fallback; normal playback ends itself.
    const timeout = window.setTimeout(leave, 10000);
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const onPreference = () => { if (preference?.matches) leave(); };
    preference?.addEventListener('change', onPreference);
    return () => {
      window.clearTimeout(timeout);
      preference?.removeEventListener('change', onPreference);
      document.body.style.overflow = overflow;
      if (focused?.isConnected) focused.focus({ preventScroll: true });
    };
  }, [leave]);

  useEffect(() => {
    if (phase !== 'leaving') return;
    const timeout = window.setTimeout(() => complete.current(), 250);
    return () => window.clearTimeout(timeout);
  }, [phase]);

  return <div ref={dialog} className="jw-opening" role="dialog" aria-modal="true" aria-label="见微开场动画" data-phase={phase} tabIndex={-1}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); leave(); }
      if (event.key === 'Tab') { event.preventDefault(); dialog.current?.focus(); }
    }}>
    <div className="jw-opening-scene" aria-hidden="true">
      {annotations.map(note => <span className="jw-opening-note" key={note.label} style={{
        '--opening-x': `${note.x}%`, '--opening-y': `${note.y}%`,
        '--opening-angle': `${note.angle}deg`, '--opening-delay': `${note.delay}s`,
      } as CSSProperties}>{note.label}</span>)}
      <video ref={video} className="jw-opening-dog" src="/videos/jianwei-opening-dog-centered.mp4"
        poster="/videos/jianwei-opening-dog-poster.webp" autoPlay muted playsInline preload="auto"
        width={720} height={720} disablePictureInPicture tabIndex={-1} onEnded={leave} onError={leave} />
    </div>
    <p className="jw-opening-signature" aria-hidden="true">See The Change.</p>
  </div>;
}
