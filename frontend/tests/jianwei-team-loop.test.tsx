import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { JianweiTeam } from '../src/JianweiPeople';

let now: number;
let nextFrame: number;
let frames: Map<number, FrameRequestCallback>;
let observers: Map<Element, IntersectionObserverCallback>;
let media: Map<string, { matches: boolean; listeners: Set<() => void> }>;

beforeEach(() => {
  now = 0; nextFrame = 0;
  frames = new Map(); observers = new Map();
  media = new Map([
    ['(max-width: 760px)', { matches: true, listeners: new Set() }],
    ['(prefers-reduced-motion: reduce)', { matches: false, listeners: new Set() }],
  ]);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('jw-team-member-copy') ? 700 : 0;
  });
  vi.stubGlobal('matchMedia', (query: string) => {
    const preference = media.get(query)!;
    return {
      get matches() { return preference.matches; },
      addEventListener: (_: string, listener: () => void) => preference.listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => preference.listeners.delete(listener),
    };
  });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal('ResizeObserver', undefined);
  vi.stubGlobal('IntersectionObserver', class {
    private targets: Element[] = [];
    constructor(private callback: IntersectionObserverCallback) {}
    observe(target: Element) { this.targets.push(target); observers.set(target, this.callback); }
    disconnect() { this.targets.forEach(target => observers.delete(target)); }
  });
});

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function visible(row: HTMLElement, value: boolean) {
  act(() => observers.get(row)?.([{ target: row, isIntersecting: value } as IntersectionObserverEntry], {} as IntersectionObserver));
}

function mount() {
  const view = render(<JianweiTeam/>);
  const row = screen.getByRole('list', { name: '观察小队，可左右滑动查看' });
  let scroll = 0;
  // Reproduce a browser that rounds every scrollLeft assignment.
  Object.defineProperty(row, 'scrollLeft', { configurable: true, get: () => scroll, set: value => { scroll = Math.round(value); } });
  visible(row, true);
  return { ...view, row };
}

function advanceFrames(count: number) {
  act(() => {
    for (let step = 0; step < count; step++) {
      now += 16;
      const callbacks = [...frames.values()]; frames.clear();
      callbacks.forEach(callback => callback(now));
    }
  });
}

function resumeDelay() {
  act(() => { now += 1800; vi.advanceTimersByTime(1800); });
}

function preference(query: string, matches: boolean) {
  act(() => {
    const value = media.get(query)!;
    value.matches = matches;
    value.listeners.forEach(listener => listener());
  });
}

it('accumulates subpixel motion and crosses the duplicated row without losing speed', () => {
  const { row } = mount();
  advanceFrames(200);
  expect(row.scrollLeft).toBeGreaterThanOrEqual(50);
  expect(row.scrollLeft).toBeLessThanOrEqual(52);
  row.scrollLeft = 699;
  fireEvent.scroll(row);
  resumeDelay();
  advanceFrames(200);
  expect(row.scrollLeft).toBeGreaterThanOrEqual(49);
  expect(row.scrollLeft).toBeLessThanOrEqual(51);
  expect(screen.getAllByRole('listitem')).toHaveLength(7);
});

it('resumes from a manual swipe position after the interaction settles', () => {
  const { row } = mount();
  advanceFrames(20);
  fireEvent.pointerDown(row);
  fireEvent.focusIn(row);
  row.scrollLeft = 320;
  fireEvent.scroll(row);
  advanceFrames(100);
  expect(row.scrollLeft).toBe(320);
  fireEvent.pointerUp(window);
  resumeDelay();
  advanceFrames(20);
  expect(row.scrollLeft).toBeGreaterThanOrEqual(324);
  expect(row.scrollLeft).toBeLessThanOrEqual(326);
});

it('keeps a keyboard reader paused until focus leaves the row', () => {
  const { row } = mount();
  advanceFrames(20);
  fireEvent.keyDown(row, { key: 'ArrowRight' });
  const before = row.scrollLeft;
  advanceFrames(100);
  expect(row.scrollLeft).toBe(before);
  fireEvent.focusOut(row);
  resumeDelay();
  advanceFrames(20);
  expect(row.scrollLeft).toBeGreaterThan(before);
});

it('stops offscreen and in a hidden page, then resumes without a time jump', () => {
  const { row, unmount } = mount();
  advanceFrames(30);
  const before = row.scrollLeft;
  visible(row, false);
  expect(frames.size).toBe(0);
  advanceFrames(100);
  expect(row.scrollLeft).toBe(before);
  visible(row, true);
  act(() => { vi.spyOn(document, 'hidden', 'get').mockReturnValue(true); document.dispatchEvent(new Event('visibilitychange')); });
  expect(frames.size).toBe(0);
  advanceFrames(100);
  act(() => { vi.spyOn(document, 'hidden', 'get').mockReturnValue(false); document.dispatchEvent(new Event('visibilitychange')); });
  advanceFrames(20);
  expect(row.scrollLeft - before).toBeGreaterThanOrEqual(4);
  expect(row.scrollLeft - before).toBeLessThanOrEqual(6);
  unmount();
  expect(frames.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

it('disables the loop for reduced motion and preserves the desktop layout across the breakpoint', () => {
  const { row } = mount();
  advanceFrames(30);
  preference('(prefers-reduced-motion: reduce)', true);
  const before = row.scrollLeft;
  expect(frames.size).toBe(0);
  advanceFrames(100);
  expect(row.scrollLeft).toBe(before);
  preference('(prefers-reduced-motion: reduce)', false);
  expect(frames.size).toBe(1);
  preference('(max-width: 760px)', false);
  expect(row.scrollLeft).toBe(0);
  expect(frames.size).toBe(0);
  preference('(max-width: 760px)', true);
  advanceFrames(20);
  expect(row.scrollLeft).toBeGreaterThan(0);
});
