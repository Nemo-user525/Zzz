import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { JianweiMagnifierStage } from '../src/JianweiMagnifierStage';

const bounds = { left: 25, top: 100, width: 1000, height: 400 };
let now: number;
let nextFrame: number;
let frames: Map<number, FrameRequestCallback>;

beforeEach(() => {
  now = 0; nextFrame = 0; frames = new Map();
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal('ResizeObserver', undefined);
  vi.stubGlobal('IntersectionObserver', undefined);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(1500);
  const originalStyle = window.getComputedStyle.bind(window);
  vi.stubGlobal('getComputedStyle', (element: Element) => element.classList.contains('jw-magnifier-control')
    ? { width: '300px', height: '200.4px', left: '460px', top: '32px' }
    : originalStyle(element));
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    ...bounds, x: bounds.left, y: bounds.top,
    right: bounds.left + bounds.width, bottom: bounds.top + bounds.height,
    toJSON: () => bounds,
  }));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function advanceFrames(count = 90) {
  act(() => {
    for (let step = 0; step < count; step++) {
      now += 16;
      const callbacks = [...frames.values()]; frames.clear();
      callbacks.forEach(callback => callback(now));
    }
  });
}

function mount() {
  const view = render(<JianweiMagnifierStage/>);
  const host = view.container.querySelector<HTMLElement>('.jw-magnifier-stage')!;
  const ellipse = view.container.querySelector('ellipse')!;
  const keyboard = view.container.querySelector('button')!;
  advanceFrames();
  const center = () => ({ x: Number(ellipse.getAttribute('cx')), y: Number(ellipse.getAttribute('cy')) });
  const home = center();
  function pointer(type: string, point: { x: number; y: number }) {
    const event = new MouseEvent(type, {
      bubbles: true, cancelable: true, button: 0,
      clientX: bounds.left + point.x, clientY: bounds.top + point.y,
    });
    Object.defineProperty(event, 'pointerType', { value: 'mouse' });
    fireEvent(host, event);
  }
  function pickup() {
    pointer('pointermove', center());
    expect(host.dataset.lensMode).toBe('following');
  }
  return { ...view, host, ellipse, keyboard, center, home, pointer, pickup };
}

it.each([
  ['left', { x: -400, y: 250 }],
  ['right', { x: 1600, y: 250 }],
  ['top', { x: 700, y: -300 }],
  ['bottom', { x: 700, y: 1000 }],
] as const)('parks a fast exit through the %s edge inside the title instead of returning home', (edge, outside) => {
  const { host, ellipse, home, center, pointer, pickup } = mount();
  pickup();
  // No final pointermove is delivered: pointerleave must capture this fast exit.
  pointer('pointerleave', outside);
  expect(host.dataset.lensMode).toBe('parked');
  advanceFrames();
  const parked = center();
  const glassRadius = Math.max(Number(ellipse.getAttribute('rx')), Number(ellipse.getAttribute('ry')));
  expect(parked.x - glassRadius).toBeGreaterThanOrEqual(0);
  expect(parked.x + glassRadius).toBeLessThanOrEqual(bounds.width);
  expect(parked.y - glassRadius).toBeGreaterThanOrEqual(0);
  expect(parked.y + glassRadius).toBeLessThanOrEqual(bounds.height);
  expect(Math.hypot(parked.x - home.x, parked.y - home.y)).toBeGreaterThan(50);
  if (edge === 'left') expect(parked.x).toBeLessThan(90);
  if (edge === 'right') expect(parked.x).toBeGreaterThan(910);
  if (edge === 'top') expect(parked.y).toBeLessThan(90);
  if (edge === 'bottom') expect(parked.y).toBeGreaterThan(310);
  advanceFrames();
  expect(center()).toEqual(parked);
});

it('can pick up the parked lens when the pointer returns to its glass', () => {
  const { host, center, pointer, pickup } = mount();
  pickup();
  pointer('pointerleave', { x: 1300, y: 250 });
  advanceFrames();
  pointer('pointerenter', center());
  expect(host.dataset.lensMode).toBe('following');
  pointer('pointermove', { x: 500, y: 180 });
  advanceFrames();
  expect(center().x).toBeCloseTo(500, 1);
  expect(center().y).toBeCloseTo(180, 1);
});

it.each(['scroll', 'blur'])('freezes the rendered position on %s without rearming pickup', eventType => {
  const { host, center, pointer, pickup } = mount();
  pickup();
  pointer('pointermove', { x: 850, y: 250 });
  advanceFrames(3);
  const before = center();
  fireEvent(window, new Event(eventType));
  advanceFrames();
  expect(host.dataset.lensMode).toBe('parked');
  expect(center().x).toBeCloseTo(before.x, 5);
  expect(center().y).toBeCloseTo(before.y, 5);
  pointer('pointermove', { x: before.x + 1, y: before.y });
  expect(host.dataset.lensMode).toBe('parked');
});

it('keeps a clicked lens parked until the pointer exits and reenters its glass', () => {
  const { host, center, pointer, pickup } = mount();
  pickup();
  pointer('pointermove', { x: 700, y: 250 });
  advanceFrames(15);
  const before = center();
  pointer('pointerdown', { x: 700, y: 250 });
  advanceFrames();
  expect(center().x).toBeCloseTo(before.x, 5);
  expect(center().y).toBeCloseTo(before.y, 5);
  fireEvent.scroll(window);
  fireEvent.blur(window);
  pointer('pointermove', center());
  expect(host.dataset.lensMode).toBe('parked');
  pointer('pointermove', { x: 10, y: 10 });
  pointer('pointermove', center());
  expect(host.dataset.lensMode).toBe('following');
});

it('still returns home when Escape explicitly requests it and clears its frame on unmount', () => {
  const { host, center, home, keyboard, pointer, pickup, unmount } = mount();
  pickup();
  pointer('pointerleave', { x: 1300, y: 250 });
  advanceFrames();
  expect(center().x).not.toBeCloseTo(home.x, 1);
  fireEvent.keyDown(keyboard, { key: 'Escape' });
  advanceFrames();
  expect(host.dataset.lensMode).toBe('idle');
  expect(keyboard.getAttribute('aria-pressed')).toBe('false');
  expect(center().x).toBeCloseTo(home.x, 5);
  expect(center().y).toBeCloseTo(home.y, 5);
  pickup();
  pointer('pointermove', { x: 700, y: 250 });
  expect(frames.size).toBe(1);
  unmount();
  expect(frames.size).toBe(0);
});
