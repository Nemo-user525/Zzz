import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { XiaoXMotion } from '../src/XiaoXMotion';

let reducedMotion = false;
const preferenceListeners = new Set<() => void>();
const frameCallbacks = new Map<number, FrameRequestCallback>();
let nextFrameId = 0;
const frameContext = {
  clearRect: vi.fn(),
  drawImage: vi.fn(),
  getImageData: vi.fn(() => {
    const data = new Uint8ClampedArray(240 * 240 * 4).fill(255);
    const ink = (120 * 240 + 120) * 4;
    data[ink] = data[ink + 1] = data[ink + 2] = 0;
    return { data, width: 240, height: 240 };
  }),
  putImageData: vi.fn(),
};

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  observe = vi.fn();
  disconnect = vi.fn();
  constructor(readonly callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
    MockIntersectionObserver.instances.push(this);
  }
}
const preference = {
  get matches() { return reducedMotion; },
  media: '(prefers-reduced-motion: reduce)',
  addEventListener: vi.fn((_event: string, listener: () => void) => preferenceListeners.add(listener)),
  removeEventListener: vi.fn((_event: string, listener: () => void) => preferenceListeners.delete(listener)),
};

class MockImage {
  static instances: MockImage[] = [];
  src = '';
  onload: (() => void) | null = null;
  constructor() { MockImage.instances.push(this); }
}

function changeMotionPreference(reduced: boolean) {
  reducedMotion = reduced;
  preferenceListeners.forEach(listener => listener());
}

function expectVisibleHero(container: HTMLElement) {
  const hero = container.querySelector<HTMLImageElement>('img');
  expect(hero?.getAttribute('src')).toBe('/images/xiaox-hero-transparent.png');
  expect(hero?.closest('.is-hidden')).toBeNull();
}

beforeEach(() => {
  // Isolate the repeating performance timer from jsdom/React's own async work.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  reducedMotion = false;
  preferenceListeners.clear();
  preference.addEventListener.mockClear();
  preference.removeEventListener.mockClear();
  MockImage.instances = [];
  MockIntersectionObserver.instances = [];
  frameCallbacks.clear();
  nextFrameId = 0;
  frameContext.clearRect.mockClear();
  frameContext.drawImage.mockClear();
  frameContext.getImageData.mockClear();
  frameContext.putImageData.mockClear();
  vi.stubGlobal('matchMedia', vi.fn(() => preference));
  vi.stubGlobal('Image', MockImage);
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    const id = ++nextFrameId;
    frameCallbacks.set(id, callback);
    return id;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => frameCallbacks.delete(id)));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(frameContext as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(240);
  vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(240);
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('alternates thinking actions after seven seconds and releases the timer and video on phase changes and unmount', () => {
  const { container, rerender, unmount } = render(<XiaoXMotion activity="thinking" />);
  const firstVideo = container.querySelector('video')!;
  expect(firstVideo.getAttribute('src')).toBe('/videos/xiaox/sorting-clues.mp4');
  expect(vi.getTimerCount()).toBe(1);

  act(() => vi.advanceTimersByTime(6999));
  expect(container.querySelector('video')).toBe(firstVideo);
  act(() => vi.advanceTimersByTime(1));
  expect(container.querySelector('video')?.getAttribute('src')).toBe('/videos/xiaox/photographing-evidence.mp4');
  expect(vi.mocked(HTMLMediaElement.prototype.pause).mock.contexts).toContain(firstVideo);

  rerender(<XiaoXMotion activity="idle" />);
  expect(vi.getTimerCount()).toBe(0);
  act(() => vi.advanceTimersByTime(14000));
  expect(container.querySelector('video')).toBeNull();
  expectVisibleHero(container);

  rerender(<XiaoXMotion activity="thinking" />);
  expect(container.querySelector('video')?.getAttribute('src')).toBe('/videos/xiaox/sorting-clues.mp4');
  expect(vi.getTimerCount()).toBe(1);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
  expect(preferenceListeners.size).toBe(0);
});

it('uses a static portrait for reduced motion without starting videos, thinking timers, or dance image loading', () => {
  reducedMotion = true;
  const { container, rerender } = render(<XiaoXMotion activity="thinking" />);
  expectVisibleHero(container);
  expect(container.querySelector('video')).toBeNull();
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);

  rerender(<XiaoXMotion activity="dancing" />);
  expectVisibleHero(container);
  expect(container.querySelector('.jw-xiaox-motion-dance-sprite')).toBeNull();
  expect(MockImage.instances).toHaveLength(0);
});

it('responds to a live reduced-motion change by stopping the active performance', () => {
  const { container, unmount } = render(<XiaoXMotion activity="thinking" />);
  const video = container.querySelector('video')!;
  fireEvent.playing(video);
  expect(container.querySelector('.jw-xiaox-motion-poster.is-hidden')).not.toBeNull();

  act(() => changeMotionPreference(true));
  expect(container.querySelector('video')).toBeNull();
  expectVisibleHero(container);
  expect(vi.getTimerCount()).toBe(0);
  expect(vi.mocked(HTMLMediaElement.prototype.pause).mock.contexts).toContain(video);

  unmount();
  expect(preference.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  expect(preferenceListeners.size).toBe(0);
});

it('retains the visible hero when autoplay is rejected instead of leaving an empty portrait', async () => {
  vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new DOMException('Autoplay denied', 'NotAllowedError'));
  const { container } = render(<XiaoXMotion activity="searching" />);
  await act(async () => {});

  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
  expectVisibleHero(container);
  expect(container.querySelector('.jw-xiaox-motion-poster.is-hidden')).toBeNull();
  expect(container.querySelector('video.is-playing')).toBeNull();
  expect(container.querySelector('canvas.is-playing')).toBeNull();
});

it('restores the hero if a video fails after playback has already started', () => {
  const { container } = render(<XiaoXMotion activity="complete" />);
  const video = container.querySelector('video')!;
  fireEvent.playing(video);
  expect(video.hidden).toBe(true);
  expect(video.classList.contains('is-playing')).toBe(false);
  expect(container.querySelector('canvas.is-playing')).not.toBeNull();
  expect(container.querySelector('.jw-xiaox-motion-poster.is-hidden')).not.toBeNull();

  fireEvent.error(video);
  expectVisibleHero(container);
  expect(container.querySelector('canvas.is-playing')).toBeNull();
  expect(frameCallbacks.size).toBe(0);
});

it('never exposes raw video and writes true transparent frame pixels into the visible canvas', () => {
  const { container, unmount } = render(<XiaoXMotion activity="searching" />);
  const video = container.querySelector('video')!;
  expect(video.hidden).toBe(true);
  expectVisibleHero(container);
  fireEvent.playing(video);

  const frame = frameContext.putImageData.mock.calls[0][0] as { data: Uint8ClampedArray };
  expect(frame.data[3]).toBe(0);
  expect(frame.data[(120 * 240 + 120) * 4 + 3]).toBe(255);
  expect(container.querySelector('canvas.is-playing')).not.toBeNull();
  expect(frameCallbacks.size).toBe(1);
  unmount();
  expect(frameCallbacks.size).toBe(0);
});

it('uses the transparent portrait and releases playback when the dog leaves the viewport', () => {
  const { container, unmount } = render(<XiaoXMotion activity="thinking" />);
  const observer = MockIntersectionObserver.instances[0];
  const video = container.querySelector('video')!;
  fireEvent.playing(video);
  expect(frameCallbacks.size).toBe(1);

  act(() => observer.callback([{ isIntersecting: false }]));
  expectVisibleHero(container);
  expect(container.querySelector('video')).toBeNull();
  expect(container.querySelector('canvas')).toBeNull();
  expect(frameCallbacks.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  expect(vi.mocked(HTMLMediaElement.prototype.pause).mock.contexts).toContain(video);
  unmount();
  expect(observer.disconnect).toHaveBeenCalledOnce();
});

it('keeps the transparent portrait if canvas access fails', () => {
  vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValueOnce(null);
  const { container } = render(<XiaoXMotion activity="searching" />);
  expectVisibleHero(container);
  expect(container.querySelector('video')?.hidden).toBe(true);
  expect(container.querySelector('canvas.is-playing')).toBeNull();
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
});

it('keeps the dance fallback until the sprite loads and removes image listeners when the dance ends', () => {
  const { container, rerender } = render(<XiaoXMotion activity="dancing" />);
  const sprite = MockImage.instances[0];
  expect(sprite.src).toBe('/images/xiaox-dance-sprite.png');
  expectVisibleHero(container);
  expect(container.querySelector('.jw-xiaox-motion-dance-sprite')).toBeNull();

  act(() => sprite.onload?.());
  expect(container.querySelector('.jw-xiaox-motion-dance-sprite')).not.toBeNull();
  expect(container.querySelector('img')).toBeNull();

  rerender(<XiaoXMotion activity="idle" />);
  expect(sprite.onload).toBeNull();
  expectVisibleHero(container);
});
