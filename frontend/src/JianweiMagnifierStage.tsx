import { useEffect, useId, useRef, type ReactNode } from 'react';
import './jianwei-magnifier.css';

function BrandLetters() {
  return <><span className="jw-title-chinese">见微</span><span className="jw-title-english"><span className="jw-title-word">MICRO</span><span className="jw-title-word">INSIGHT</span></span></>;
}

// Coordinates of the glass inside the original 1500 × 1002 image. The image
// stays intact; a clipped, live title layer replaces only its opaque glass.
const GLASS = { x: 435, y: 373, rx: 274, ry: 260 };

export function JianweiMagnifierStage({ children }: { children?: ReactNode }) {
  const clipId = `jw-glass-${useId().replace(/:/g, '')}`;
  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const glass = useRef<HTMLDivElement>(null);
  const sample = useRef<HTMLDivElement>(null);
  const ellipse = useRef<SVGEllipseElement>(null);
  const keyboardControl = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const host = stage.current;
    const rim = frame.current;
    const photo = image.current;
    const lens = glass.current;
    const content = sample.current;
    const aperture = ellipse.current;
    const control = keyboardControl.current;
    if (!host || !rim || !photo || !lens || !content || !aperture || !control || !window.matchMedia) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const touch = window.matchMedia('(hover: none), (pointer: coarse)');
    let raf = 0;
    let width = 0, height = 0, left = 0, top = 0;
    let stageWidth = 0, stageHeight = 0, homeX = 0, homeY = 0;
    let radiusX = 0, radiusY = 0;
    let lensX = 0, lensY = 0, lensAngle = 50, glassRx = 0, glassRy = 0;
    let mode: 'idle' | 'following' | 'parked' = 'idle';
    let pickupArmed = true;
    let x = 0, y = 0, targetX = 0, targetY = 0;
    let zoom = 1, zoomFrom = 1, zoomTo = 1, zoomStart = 0, zoomDuration = 220;
    let entranceStart = performance.now();
    let lastTime = entranceStart;
    let settled = reduced.matches;
    let demoPlayed = false;
    let demoTimers: number[] = [];
    let disposed = false;
    const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

    function draw(angle: number, entranceY: number) {
      const scale = width / 1500;
      const radians = angle * Math.PI / 180;
      const dx = (GLASS.x - 750) * scale;
      const dy = (GLASS.y - 501) * scale;
      // CSS translates the frame by half its width, then rotates around its
      // centre. Use that same transform for the clip and the zoom origin.
      const cx = left + x + dx * Math.cos(radians) - dy * Math.sin(radians);
      const cy = top + height / 2 + y + entranceY + dx * Math.sin(radians) + dy * Math.cos(radians);
      lensX = cx; lensY = cy; lensAngle = angle;
      glassRx = GLASS.rx * scale; glassRy = GLASS.ry * scale;
      rim!.style.transform = `translate3d(calc(-50% + ${x}px), ${y + entranceY}px, 0) rotate(${angle}deg)`;
      aperture!.setAttribute('cx', `${cx}`);
      aperture!.setAttribute('cy', `${cy}`);
      aperture!.setAttribute('rx', `${GLASS.rx * scale}`);
      aperture!.setAttribute('ry', `${GLASS.ry * scale}`);
      aperture!.setAttribute('transform', `rotate(${angle} ${cx} ${cy})`);
      content!.style.transformOrigin = `${cx}px ${cy}px`;
      content!.style.transform = `scale(${zoom})`;
      lens!.style.setProperty('--jw-glass-x', `${cx}px`);
      lens!.style.setProperty('--jw-glass-y', `${cy}px`);
      lens!.style.setProperty('--jw-glass-radius', `${GLASS.rx * scale}px`);
      lens!.style.setProperty('--jw-glass-focus', `${(zoom - 1) / .2}`);
      control!.style.left = `${cx - glassRx}px`;
      control!.style.top = `${cy - glassRy}px`;
      control!.style.width = `${glassRx * 2}px`;
      control!.style.height = `${glassRy * 2}px`;
      control!.style.transform = `rotate(${angle}deg)`;
      control!.hidden = reduced.matches || touch.matches || !photo!.complete || !photo!.naturalWidth;
      // Never show a floating glass overlay before its frame arrives.
      host!.dataset.lensReady = photo!.complete && photo!.naturalWidth > 0 ? 'true' : 'false';
    }

    function tick(now: number) {
      raf = 0;
      if (disposed) return;
      const dt = Math.min(64, Math.max(0, now - lastTime));
      lastTime = now;
      const ease = 1 - Math.exp(-dt / 90);
      x += (targetX - x) * ease;
      y += (targetY - y) * ease;
      const entrance = settled ? 1 : Math.min(1, (now - entranceStart) / 700);
      const landing = (1 - entrance) ** 3;
      settled = entrance === 1;
      const progress = Math.min(1, Math.max(0, (now - zoomStart) / zoomDuration));
      zoom = zoomFrom + (zoomTo - zoomFrom) * (1 - (1 - progress) ** 3);
      const moving = Math.abs(targetX - x) + Math.abs(targetY - y) > .015;
      if (!moving) { x = targetX; y = targetY; }
      draw(50 - 3 * landing, 8 * landing);
      if (!settled || moving || progress < 1) schedule();
    }

    function schedule() {
      if (!raf && !disposed) raf = requestAnimationFrame(tick);
    }

    function focus(active: boolean) {
      if (reduced.matches) return;
      const next = active ? 1.2 : 1;
      if (next === zoomTo) return;
      zoomFrom = zoom;
      zoomTo = next;
      zoomStart = performance.now();
      zoomDuration = active ? 220 : 300;
      schedule();
    }

    function measure() {
      const parkedPosition = mode === 'parked' && stageWidth && stageHeight
        ? { x: (homeX + x) / stageWidth, y: (homeY + y) / stageHeight } : null;
      const rect = host!.getBoundingClientRect();
      stageWidth = rect.width;
      stageHeight = rect.height;
      // Older browser engines use the same measured unit for both title layers.
      host!.style.setProperty('--jw-stage-unit', `${stageWidth / 100}px`);
      const style = getComputedStyle(rim!);
      width = parseFloat(style.width);
      height = parseFloat(style.height);
      left = parseFloat(style.left);
      top = parseFloat(style.top);
      const scale = width / 1500;
      const radians = 50 * Math.PI / 180;
      const dx = (GLASS.x - 750) * scale;
      const dy = (GLASS.y - 501) * scale;
      homeX = left + dx * Math.cos(radians) - dy * Math.sin(radians);
      homeY = top + height / 2 + dx * Math.sin(radians) + dy * Math.cos(radians);
      radiusX = Math.hypot(GLASS.rx * Math.cos(radians), GLASS.ry * Math.sin(radians)) * scale + 6;
      radiusY = Math.hypot(GLASS.rx * Math.sin(radians), GLASS.ry * Math.cos(radians)) * scale + 6;
      if (parkedPosition && !reduced.matches && !touch.matches) {
        x = targetX = clamp(parkedPosition.x * stageWidth, radiusX, stageWidth - radiusX) - homeX;
        y = targetY = clamp(parkedPosition.y * stageHeight, radiusY, stageHeight - radiusY) - homeY;
      } else {
        setMode('idle');
        x = y = targetX = targetY = 0;
        focus(false);
      }
      // Resizing should not play the entrance again or leave the aperture at
      // the previous breakpoint's position, including in reduced-motion mode.
      if (reduced.matches) draw(50, 0);
      else schedule();
    }

    function move(event: PointerEvent) {
      if (reduced.matches || touch.matches || event.pointerType !== 'mouse') return;
      const rect = host!.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      if (mode !== 'following') {
        const radians = lensAngle * Math.PI / 180;
        const dx = px - lensX, dy = py - lensY;
        const localX = dx * Math.cos(radians) + dy * Math.sin(radians);
        const localY = -dx * Math.sin(radians) + dy * Math.cos(radians);
        const inside = glassRx > 0 && glassRy > 0 && (localX / glassRx) ** 2 + (localY / glassRy) ** 2 <= 1;
        if (!inside) { pickupArmed = true; return; }
        // After placing the lens, crossing out of its glass and back in is
        // required to pick it up again. Tiny movements cannot undo a click.
        if (!pickupArmed || !photo!.complete || !photo!.naturalWidth) return;
        setMode('following');
      }
      // Move the actual lens centre to the pointer across both title rows.
      // Clamp the aperture inside the stage so edge letters stay readable.
      targetX = clamp(px, radiusX, stageWidth - radiusX) - homeX;
      targetY = clamp(py, radiusY, stageHeight - radiusY) - homeY;
      focus(true);
      schedule();
    }

    function setMode(next: typeof mode) {
      mode = next;
      host!.dataset.lensMode = next;
      control!.setAttribute('aria-pressed', `${next === 'following'}`);
    }

    function resetPosition() {
      setMode('idle');
      pickupArmed = true;
      targetX = targetY = 0;
      focus(false);
      if (!reduced.matches) schedule();
    }

    function leave(event: Event) {
      if (mode === 'following') {
        const pointer = event as PointerEvent;
        park(event.type === 'pointerleave' && pointer.pointerType === 'mouse' ? pointer : undefined);
      }
      if (event.type === 'pointerleave' || event.type === 'pointercancel') pickupArmed = true;
    }

    function park(edgePointer?: PointerEvent) {
      setMode('parked');
      pickupArmed = false;
      if (edgePointer) {
        // A fast pointer can leave without a final move inside the stage.
        // Settle at its nearest safe edge, keeping the glass inside the title.
        const rect = host!.getBoundingClientRect();
        targetX = clamp(edgePointer.clientX - rect.left, radiusX, stageWidth - radiusX) - homeX;
        targetY = clamp(edgePointer.clientY - rect.top, radiusY, stageHeight - radiusY) - homeY;
      } else {
        // Clicks, scroll and blur keep the position already on screen.
        targetX = x; targetY = y;
      }
      settled = true;
      focus(true);
      schedule();
    }

    function place(event: PointerEvent) {
      if (event.pointerType !== 'mouse' || event.button !== 0 || mode !== 'following') return;
      event.preventDefault();
      park();
    }

    function keyDown(event: KeyboardEvent) {
      if (reduced.matches || touch.matches) return;
      if (event.key === 'Escape') { event.preventDefault(); resetPosition(); return; }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (mode === 'following') park();
        else { setMode('following'); focus(true); }
        return;
      }
      const step = event.shiftKey ? 32 : 16;
      const directions: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const direction = directions[event.key];
      if (!direction) return;
      event.preventDefault();
      setMode('following');
      targetX = clamp(homeX + targetX + direction[0], radiusX, stageWidth - radiusX) - homeX;
      targetY = clamp(homeY + targetY + direction[1], radiusY, stageHeight - radiusY) - homeY;
      focus(true);
      schedule();
    }

    function clearDemo() {
      demoTimers.forEach(window.clearTimeout);
      demoTimers = [];
    }

    function playDemo() {
      if (demoPlayed || reduced.matches || !touch.matches || !photo!.complete || !photo!.naturalWidth) return;
      demoPlayed = true;
      demoTimers = [window.setTimeout(() => focus(true), 800), window.setTimeout(() => focus(false), 1450)];
    }

    function changePreference() {
      clearDemo();
      cancelAnimationFrame(raf);
      raf = 0;
      setMode('idle');
      pickupArmed = true;
      x = y = targetX = targetY = 0;
      zoom = zoomFrom = zoomTo = 1;
      settled = true;
      draw(50, 0);
    }

    function photoLoaded() {
      if (!reduced.matches) { entranceStart = performance.now(); settled = false; }
      measure();
      const rect = host!.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) playDemo();
    }

    photo.addEventListener('load', photoLoaded);
    host.addEventListener('pointerenter', move);
    host.addEventListener('pointermove', move, { passive: true });
    host.addEventListener('pointerdown', place);
    host.addEventListener('pointerleave', leave);
    host.addEventListener('pointercancel', leave);
    reduced.addEventListener('change', changePreference);
    touch.addEventListener('change', changePreference);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', leave, { passive: true });
    window.addEventListener('blur', leave);
    control.addEventListener('keydown', keyDown);
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    resize?.observe(host);
    const visibility = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        playDemo();
        if (demoPlayed) visibility?.disconnect();
      }
    }, { threshold: .5 });
    visibility?.observe(host);
    if (!visibility) playDemo();
    measure();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      clearDemo();
      resize?.disconnect();
      visibility?.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', leave);
      window.removeEventListener('blur', leave);
      photo.removeEventListener('load', photoLoaded);
      host.removeEventListener('pointerenter', move);
      host.removeEventListener('pointermove', move);
      host.removeEventListener('pointerdown', place);
      host.removeEventListener('pointerleave', leave);
      host.removeEventListener('pointercancel', leave);
      reduced.removeEventListener('change', changePreference);
      touch.removeEventListener('change', changePreference);
      control.removeEventListener('keydown', keyDown);
    };
  }, []);

  return <div className="jw-stage jw-magnifier-stage" ref={stage}>
    <h1 className="jw-research-title" aria-label="见微 MICROINSIGHT"><BrandLetters/></h1>
    <div className="jw-magnifier-control" ref={frame} aria-hidden="true">
      <img ref={image} className="jw-gold-magnifier" src="/images/gold-magnifier.png" alt="" loading="eager" decoding="async" width="1500" height="1002"/>
    </div>
    <svg className="jw-lens-definitions" width="0" height="0" aria-hidden="true" focusable="false">
      <defs><clipPath id={clipId} clipPathUnits="userSpaceOnUse"><ellipse ref={ellipse}/></clipPath></defs>
    </svg>
    <div className="jw-lens-scene" ref={glass} style={{ clipPath: `url(#${clipId})` }} aria-hidden="true">
      <div className="jw-lens-sample" ref={sample}>
        <div className="jw-research-title"><BrandLetters/></div>
      </div>
      <div className="jw-lens-glaze"/>
    </div>
    <button ref={keyboardControl} className="jw-lens-keyboard" type="button" aria-label="放大镜：回车拿起或放下，方向键移动，Esc 归位" aria-pressed="false"/>
    {children}
  </div>;
}
