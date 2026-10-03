import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';

type Point = { x: number; y: number };
type Viewport = { width: number; height: number; x: number; y: number };
type Gesture = { id: number; x: number; y: number; origin: Point; moved: boolean };
const EDGE = 12;
const HINT_SPACE = 32;

function visibleViewport(): Viewport {
  const visual = window.visualViewport;
  return {
    width: visual && visual.width > 0 ? visual.width : window.innerWidth,
    height: visual && visual.height > 0 ? visual.height : window.innerHeight,
    // Fixed positioning and client pointer coordinates both use the layout viewport.
    x: visual?.offsetLeft || 0,
    y: visual?.offsetTop || 0,
  };
}

export function useDraggableCompanion(panelOpen: boolean) {
  const companionRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const hasDragged = useRef(false);
  const [position, setPosition] = useState<Point | null>(null);
  const [dragging, setDragging] = useState(false);
  const [viewport, setViewport] = useState(visibleViewport);
  const [panelPosition, setPanelPosition] = useState<Point>({ x: EDGE, y: EDGE });

  function constrain(point: Point): Point {
    const visible = visibleViewport();
    const rect = companionRef.current?.getBoundingClientRect();
    const hintHeight = companionRef.current?.querySelector('.jw-companion-hint')?.getBoundingClientRect().height || 0;
    const minX = visible.x + EDGE;
    const minY = visible.y + Math.max(HINT_SPACE, hintHeight + EDGE);
    const maxX = Math.max(minX, visible.x + visible.width - (rect?.width || 144) - EDGE);
    const maxY = Math.max(minY, visible.y + visible.height - (rect?.height || 144) - EDGE);
    return { x: Math.min(maxX, Math.max(minX, point.x)), y: Math.min(maxY, Math.max(minY, point.y)) };
  }

  function bottomRight(): Point | null {
    const element = companionRef.current;
    const rect = element?.getBoundingClientRect();
    if (!element || !rect?.width || !rect.height) return null;
    const visible = visibleViewport();
    const style = getComputedStyle(element);
    const right = parseFloat(style.getPropertyValue('--jw-companion-right')) || 22;
    const bottom = parseFloat(style.getPropertyValue('--jw-companion-bottom')) || 88;
    // Do not turn a transient first-frame (0, 0) measurement into a saved position.
    return constrain({ x: visible.x + visible.width - rect.width - right, y: visible.y + visible.height - rect.height - bottom });
  }

  useEffect(() => {
    const resize = () => setViewport(visibleViewport());
    const visual = window.visualViewport;
    window.addEventListener('resize', resize);
    visual?.addEventListener('resize', resize);
    visual?.addEventListener('scroll', resize);
    return () => {
      window.removeEventListener('resize', resize);
      visual?.removeEventListener('resize', resize);
      visual?.removeEventListener('scroll', resize);
    };
  }, []);

  useLayoutEffect(() => {
    setPosition(current => {
      const next = hasDragged.current && current ? constrain(current) : bottomRight();
      return !next || current?.x === next.x && current?.y === next.y ? current : next;
    });
  }, [viewport]);

  useEffect(() => {
    if (typeof ResizeObserver !== 'function' || !companionRef.current) return;
    const observer = new ResizeObserver(() => setPosition(current => {
      const next = hasDragged.current && current ? constrain(current) : bottomRight();
      return !next || current?.x === next.x && current?.y === next.y ? current : next;
    }));
    observer.observe(companionRef.current);
    const hint = companionRef.current.querySelector('.jw-companion-hint');
    if (hint) observer.observe(hint);
    return () => observer.disconnect();
  }, []);

  const panelWidth = Math.min(340, Math.max(0, viewport.width - EDGE * 2));
  useLayoutEffect(() => {
    if (!panelOpen || !panelRef.current || !companionRef.current) return;
    const update = () => {
      const dog = companionRef.current!.getBoundingClientRect();
      const panelHeight = panelRef.current!.getBoundingClientRect().height;
      const minX = viewport.x + EDGE;
      const minY = viewport.y + EDGE;
      const rightEdge = viewport.x + viewport.width - EDGE;
      const bottomEdge = viewport.y + viewport.height - EDGE;
      const leftSide = dog.left - panelWidth - EDGE;
      const rightSide = dog.right + EDGE;
      const fitsBeside = leftSide >= minX || rightSide + panelWidth <= rightEdge;
      const preferredX = leftSide >= minX ? leftSide : rightSide + panelWidth <= rightEdge
        ? rightSide : dog.left + dog.width / 2 - panelWidth / 2;
      const above = dog.top - panelHeight - EDGE;
      const below = dog.bottom + EDGE;
      const preferredY = !fitsBeside && above >= minY ? above
        : !fitsBeside && below + panelHeight <= bottomEdge ? below
        : dog.top + dog.height / 2 - panelHeight / 2;
      const next = {
        x: Math.max(minX, Math.min(rightEdge - panelWidth, preferredX)),
        y: Math.max(minY, Math.min(bottomEdge - panelHeight, preferredY)),
      };
      setPanelPosition(current => current.x === next.x && current.y === next.y ? current : next);
    };
    update();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    observer?.observe(panelRef.current);
    return () => observer?.disconnect();
  }, [panelOpen, position, viewport, panelWidth]);

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || event.isPrimary === false || gesture.current) return;
    const rect = companionRef.current?.getBoundingClientRect();
    if (!rect) return;
    suppressClick.current = false;
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, origin: { x: rect.left, y: rect.top }, moved: false };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Older embedded browsers may not support capture. */ }
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    const dx = event.clientX - current.x, dy = event.clientY - current.y;
    if (!current.moved && Math.hypot(dx, dy) < 6) return;
    current.moved = true;
    hasDragged.current = true;
    suppressClick.current = true;
    setDragging(true);
    setPosition(constrain({ x: current.origin.x + dx, y: current.origin.y + dy }));
  }

  function finish(event: PointerEvent<HTMLButtonElement>, cancelled = false) {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    suppressClick.current = current.moved || cancelled;
    gesture.current = null;
    setDragging(false);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    } catch { /* The browser may already have released capture. */ }
  }

  function consumeDragClick(event: MouseEvent<HTMLButtonElement>) {
    if (!suppressClick.current || event.detail === 0) return false;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  return {
    companionRef, panelRef, dragging, consumeDragClick,
    positionStyle: position ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' } as CSSProperties : undefined,
    panelStyle: { position: 'fixed', left: panelPosition.x, top: panelPosition.y, right: 'auto', bottom: 'auto', width: panelWidth,
      maxWidth: panelWidth, maxHeight: Math.max(0, viewport.height - EDGE * 2), boxSizing: 'border-box' } as CSSProperties,
    pointerHandlers: {
      onPointerDown, onPointerMove,
      onPointerUp: (event: PointerEvent<HTMLButtonElement>) => finish(event),
      onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => finish(event, true),
      onLostPointerCapture: (event: PointerEvent<HTMLButtonElement>) => finish(event, true),
    },
  };
}
