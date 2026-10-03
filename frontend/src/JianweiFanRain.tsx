import { useEffect, useId, useRef } from 'react';

/** The reference site's coin cadence and sine-in descent, applied to the supplied fan. */
export function JianweiFanRain() {
  const host = useRef<HTMLDivElement>(null);
  const cutoutId = `jw-fan-cutout-${useId().replace(/:/g, '')}`;
  useEffect(() => {
    if (!host.current || typeof matchMedia !== 'function') return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    let active: SVGSVGElement | null = null;
    let elapsed = 0;
    let last = 0;
    let duration = 0;
    let distance = 0;
    let size = 0;
    let x = 0;
    let angle = 0;
    let spin = 0;
    const random = (low: number, high: number) => low + Math.random() * (high - low);
    const tick = (now: number) => {
      if (!active || document.hidden || reduced.matches) return;
      elapsed += last ? now - last : 0;
      last = now;
      const progress = Math.min(elapsed / duration, 1);
      const y = -size * 1.4 + distance * (1 - Math.cos(progress * Math.PI / 2));
      active.style.transform = `translate3d(${x}px,${y}px,0) rotate(${angle + spin * progress}deg)`;
      if (progress < 1) frame = requestAnimationFrame(tick);
      else { active.remove(); active = null; }
    };
    const spawn = () => {
      if (document.hidden || reduced.matches || active || !host.current) return;
      const ns = 'http://www.w3.org/2000/svg';
      active = document.createElementNS(ns, 'svg');
      active.setAttribute('viewBox', '55 75 630 435');
      active.setAttribute('aria-hidden', 'true');
      active.classList.add('jw-falling-fan');
      active.style.opacity = '1';
      active.style.mixBlendMode = 'normal';
      const defs = document.createElementNS(ns, 'defs');
      const filter = document.createElementNS(ns, 'filter');
      filter.setAttribute('id', cutoutId);
      filter.setAttribute('color-interpolation-filters', 'sRGB');
      // The supplied blue artwork has a nearly zero red channel. Remove its
      // white matte without multiplying the blue artwork into the page below.
      // Raising the cutout alpha keeps every blue interior pixel fully opaque;
      // the small dead zone removes the near-white JPEG compression fringe.
      const redToAlpha = document.createElementNS(ns, 'feColorMatrix');
      redToAlpha.setAttribute('type', 'matrix');
      redToAlpha.setAttribute('values', '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  -1 0 0 0 1');
      const transfer = document.createElementNS(ns, 'feComponentTransfer');
      const alpha = document.createElementNS(ns, 'feFuncA');
      alpha.setAttribute('type', 'linear');
      alpha.setAttribute('slope', '5');
      alpha.setAttribute('intercept', '-0.15');
      transfer.append(alpha);
      filter.append(redToAlpha, transfer);
      defs.append(filter);
      const image = document.createElementNS(ns, 'image');
      image.setAttribute('href', '/images/hz-fan-reference.jpg');
      image.setAttribute('width', '740');
      image.setAttribute('height', '740');
      image.setAttribute('filter', `url(#${cutoutId})`);
      active.append(defs, image);
      size = window.innerWidth <= 1080 ? 80 : 111;
      active.style.width = `${size}px`;
      x = random(size, Math.max(size, window.innerWidth - size * 2));
      duration = random(5000, 8000);
      angle = random(-160, 160);
      spin = random(150, 340) * (Math.random() < .5 ? -1 : 1);
      distance = window.innerHeight + size * 2.8;
      elapsed = 0; last = 0;
      active.style.transform = `translate3d(${x}px,${-size * 1.4}px,0) rotate(${angle}deg)`;
      host.current.append(active);
      frame = requestAnimationFrame(tick);
    };
    const schedule = (first = false) => {
      clearTimeout(timer);
      if (reduced.matches || document.hidden) return;
      timer = setTimeout(() => { spawn(); schedule(); }, first ? random(2500, 4000) : random(8000, 16000));
    };
    const visibility = () => {
      clearTimeout(timer); cancelAnimationFrame(frame); last = 0;
      if (!document.hidden && !reduced.matches) {
        if (active) frame = requestAnimationFrame(tick);
        schedule();
      }
    };
    const preference = () => {
      clearTimeout(timer); cancelAnimationFrame(frame);
      active?.remove(); active = null;
      schedule(true);
    };
    schedule(true);
    document.addEventListener('visibilitychange', visibility);
    reduced.addEventListener('change', preference);
    return () => {
      clearTimeout(timer); cancelAnimationFrame(frame); active?.remove();
      document.removeEventListener('visibilitychange', visibility);
      reduced.removeEventListener('change', preference);
    };
  }, [cutoutId]);
  return <div ref={host} className="jw-fan-rain" aria-hidden="true"/>;
}
