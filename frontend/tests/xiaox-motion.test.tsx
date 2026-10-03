import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { XiaoXMotion } from '../src/XiaoXMotion';

let reducedMotion = false;
let blankFrame = false;
const preferenceListeners = new Set<() => void>();
const frameCallbacks = new Map<number, FrameRequestCallback>();
let nextFrameId = 0;
function decodedFrame() {
  const data = new Uint8ClampedArray(240 * 240 * 4).fill(255);
  if (!blankFrame) {
    const ink = (120 * 240 + 120) * 4;
    data[ink] = data[ink + 1] = data[ink + 2] = 0;
  }
  return { data, width: 240, height: 240 };
}
const scratchContext = {
  clearRect: vi.fn(), drawImage: vi.fn(), getImageData: vi.fn(decodedFrame), putImageData: vi.fn(),
};
const displayContext = {
  clearRect: vi.fn(), drawImage: vi.fn(), getImageData: vi.fn(decodedFrame), putImageData: vi.fn(),
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
function changeMotionPreference(reduced: boolean) {
  reducedMotion = reduced;
  preferenceListeners.forEach(listener => listener());
}
function expectVisibleHero(container: HTMLElement) {
  const hero = container.querySelector<HTMLImageElement>('img');
  expect(hero?.getAttribute('src')).toBe('/images/xiaox-hero-transparent.png');
  expect(hero?.closest('.is-hidden')).toBeNull();
}
function shownActivity(container: HTMLElement) {
  return container.querySelector('.jw-xiaox-motion')?.getAttribute('data-motion-activity');
}
function advance(milliseconds: number) {
  act(() => vi.advanceTimersByTime(milliseconds));
}
function drawNextFrame(milliseconds = 100) {
  advance(milliseconds);
  const pending = [...frameCallbacks];
  act(() => {
    for (const [id, callback] of pending) {
      frameCallbacks.delete(id);
      callback(performance.now());
    }
  });
}
function deferredPlay() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] });
  reducedMotion = false;
  blankFrame = false;
  preferenceListeners.clear();
  MockIntersectionObserver.instances = [];
  frameCallbacks.clear();
  nextFrameId = 0;
  vi.clearAllMocks();
  vi.stubGlobal('matchMedia', vi.fn(() => preference));
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    const id = ++nextFrameId;
    frameCallbacks.set(id, callback);
    return id;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => frameCallbacks.delete(id)));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    return (this.isConnected ? displayContext : scratchContext) as unknown as CanvasRenderingContext2D;
  });
  vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(240);
  vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(240);
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('finishes the current clip once before applying only the latest requested phase', () => {
  const { container, rerender } = render(<XiaoXMotion activity="searching" />);
  const video = container.querySelector('video')!;
  const canvas = container.querySelector('canvas');
  fireEvent.playing(video);
  expect(video.loop).toBe(false);
  rerender(<XiaoXMotion activity="reviewing" />);
  advance(100);
  rerender(<XiaoXMotion activity="thinking" />);
  advance(100);
  rerender(<XiaoXMotion activity="complete" />);
  advance(30000);
  expect(shownActivity(container)).toBe('searching');
  expect(container.querySelector('video')).toBe(video);
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  fireEvent.ended(video);
  const report = container.querySelector('video')!;
  expect(shownActivity(container)).toBe('complete');
  expect(report.getAttribute('src')).toBe('/videos/xiaox/presenting-report.mp4');
  expect(report).not.toBe(video);
  expect(container.querySelector('canvas')).toBe(canvas);
  fireEvent.playing(report);
  fireEvent.ended(report);
  fireEvent.ended(video);
  advance(30000);
  expect(container.querySelector('video')).toBe(report);
  expect(container.querySelector('canvas.is-playing')).toBe(canvas);
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
  expect(frameCallbacks.size).toBe(0);
});

it('plays all four idle clips in order and advances only once for each real ended event', () => {
  const { container, unmount } = render(<XiaoXMotion activity="idle" />);
  const clips = ['searching', 'sorting-clues', 'photographing-evidence', 'presenting-report'];
  const canvas = container.querySelector('canvas');
  for (let index = 0; index < 8; index++) {
    const video = container.querySelector('video')!;
    expect(video.getAttribute('src')).toBe(`/videos/xiaox/${clips[index % clips.length]}.mp4`);
    expect(video.loop).toBe(false);
    fireEvent.playing(video);
    advance(30000);
    expect(container.querySelector('video')).toBe(video);
    expect(vi.getTimerCount()).toBe(0);
    fireEvent.ended(video);
    const next = container.querySelector('video')!;
    expect(next.getAttribute('src')).toBe(`/videos/xiaox/${clips[(index + 1) % clips.length]}.mp4`);
    expect(next).not.toBe(video);
    fireEvent.ended(video);
    expect(container.querySelector('video')).toBe(next);
    expect(container.querySelector('canvas')).toBe(canvas);
  }
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(9);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
  expect(frameCallbacks.size).toBe(0);
});

it.each(['listening', 'attention'] as const)('plays a muted %s clip once and leaves without waiting for ended', activity => {
  const { container, rerender } = render(<XiaoXMotion activity={activity} />);
  const video = container.querySelector('video')!;
  expect(video.getAttribute('src')).toBe('/videos/xiaox/searching.mp4');
  expect(video.loop).toBe(false);
  expect(video.muted).toBe(true);
  expect(video.playsInline).toBe(true);
  fireEvent.playing(video);
  advance(30000);
  expect(container.querySelector('canvas.is-playing')).not.toBeNull();
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  rerender(<XiaoXMotion activity="complete" />);
  expect(shownActivity(container)).toBe('complete');
  expect(container.querySelector('video')?.getAttribute('src')).toBe('/videos/xiaox/presenting-report.mp4');
  expect(container.querySelector('video')?.loop).toBe(false);
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
});

it('advances thinking only on ended and ignores events from an obsolete video', () => {
  const { container, unmount } = render(<XiaoXMotion activity="thinking" />);
  const papers = container.querySelector('video')!;
  fireEvent.playing(papers);
  advance(30000);
  expect(container.querySelector('video')).toBe(papers);
  expect(papers.loop).toBe(false);
  fireEvent.ended(papers);
  const camera = container.querySelector('video')!;
  expect(camera.getAttribute('src')).toBe('/videos/xiaox/photographing-evidence.mp4');
  fireEvent.ended(papers);
  fireEvent.error(papers);
  expect(container.querySelector('video')).toBe(camera);
  fireEvent.playing(camera);
  advance(30000);
  expect(container.querySelector('video')).toBe(camera);
  fireEvent.ended(camera);
  const nextPapers = container.querySelector('video')!;
  expect(nextPapers.getAttribute('src')).toBe('/videos/xiaox/sorting-clues.mp4');
  expect(nextPapers).not.toBe(papers);
  fireEvent.ended(papers);
  expect(container.querySelector('video')).toBe(nextPapers);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
  expect(frameCallbacks.size).toBe(0);
});

it.each(['searching', 'reviewing'] as const)('uses the relevant two-clip playlist throughout %s', activity => {
  const { container, unmount } = render(<XiaoXMotion activity={activity} />);
  const firstClip = activity === 'searching' ? 'searching' : 'sorting-clues';
  for (const clip of [firstClip, 'photographing-evidence', firstClip, 'photographing-evidence']) {
    const video = container.querySelector('video')!;
    expect(video.getAttribute('src')).toBe(`/videos/xiaox/${clip}.mp4`);
    expect(video.loop).toBe(false);
    fireEvent.playing(video);
    advance(30000);
    expect(container.querySelector('video')).toBe(video);
    fireEvent.ended(video);
  }
  unmount();
  expect(vi.getTimerCount()).toBe(0);
  expect(frameCallbacks.size).toBe(0);
});

it('does not replay papers across thinking and reviewing, then continues with camera', () => {
  const { container, rerender } = render(<XiaoXMotion activity="thinking" />);
  const video = container.querySelector('video')!;
  fireEvent.playing(video);
  video.currentTime = 3.5;
  rerender(<XiaoXMotion activity="reviewing" />);
  advance(30000);
  expect(shownActivity(container)).toBe('reviewing');
  expect(container.querySelector('video')).toBe(video);
  expect(video.currentTime).toBe(3.5);
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  fireEvent.ended(video);
  const camera = container.querySelector('video')!;
  expect(camera.getAttribute('src')).toBe('/videos/xiaox/photographing-evidence.mp4');
  fireEvent.playing(camera);
  rerender(<XiaoXMotion activity="thinking" />);
  advance(30000);
  expect(shownActivity(container)).toBe('reviewing');
  expect(container.querySelector('video')).toBe(camera);
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
  fireEvent.ended(camera);
  expect(shownActivity(container)).toBe('thinking');
  expect(container.querySelector('video')?.getAttribute('src')).toBe('/videos/xiaox/sorting-clues.mp4');
});

it.each(['listening', 'attention', 'complete'] as const)('holds the final frame without replaying a finished %s clip', activity => {
  const { container, rerender } = render(<XiaoXMotion activity={activity} />);
  const video = container.querySelector('video')!;
  fireEvent.playing(video);
  fireEvent.ended(video);
  rerender(<XiaoXMotion activity={activity} className="updated" />);
  advance(30000);
  fireEvent.ended(video);
  expect(video.loop).toBe(false);
  expect(container.querySelector('video')).toBe(video);
  expect(container.querySelector('canvas.is-playing')).not.toBeNull();
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('keeps actual video motion when voice or attention interrupts a workflow', () => {
  const { container, rerender } = render(<XiaoXMotion activity="searching" />);
  const video = container.querySelector('video')!;
  fireEvent.playing(video);
  rerender(<XiaoXMotion activity="complete" />);
  rerender(<XiaoXMotion activity="listening" />);
  expect(shownActivity(container)).toBe('listening');
  expect(container.querySelector('video')).toBe(video);
  expect(video.loop).toBe(false);
  fireEvent.playing(video);
  expect(container.querySelector('canvas.is-playing')).not.toBeNull();
  rerender(<XiaoXMotion activity="thinking" />);
  expect(shownActivity(container)).toBe('thinking');
  rerender(<XiaoXMotion activity="attention" />);
  expect(shownActivity(container)).toBe('attention');
  const waiting = container.querySelector('video')!;
  fireEvent.playing(waiting);
  expect(waiting.loop).toBe(false);
  rerender(<XiaoXMotion activity="idle" />);
  expect(shownActivity(container)).toBe('idle');
  expect(container.querySelector('video')).toBe(waiting);
  expect(container.querySelector('.jw-xiaox-motion-attention')).toBeNull();
  expect(container.querySelector('.jw-xiaox-motion-listening')).toBeNull();
  fireEvent.ended(video);
  advance(30000);
  expect(shownActivity(container)).toBe('idle');
});

it('preserves the previous transparent frame while the next clip loads or has blank frames', () => {
  const { container, rerender } = render(<XiaoXMotion activity="searching" />);
  const video = container.querySelector('video')!;
  fireEvent.playing(video);
  const canvas = container.querySelector('canvas');
  blankFrame = true;
  rerender(<XiaoXMotion activity="complete" />);
  fireEvent.ended(video);
  const report = container.querySelector('video')!;
  displayContext.putImageData.mockClear();
  displayContext.clearRect.mockClear();
  fireEvent.playing(report);
  drawNextFrame();
  expect(container.querySelector('canvas.is-playing')).toBe(canvas);
  expect(container.querySelector('.jw-xiaox-motion-poster.is-hidden')).not.toBeNull();
  expect(displayContext.putImageData).not.toHaveBeenCalled();
  expect(displayContext.clearRect).not.toHaveBeenCalled();
  fireEvent.error(report);
  advance(30000);
  expect(container.querySelector('canvas.is-playing')).toBe(canvas);
  expect(frameCallbacks.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

it('allows a slow first frame to arrive without timing out an otherwise playing clip', () => {
  blankFrame = true;
  const { container, rerender } = render(<XiaoXMotion activity="thinking" />);
  const video = container.querySelector('video')!;
  fireEvent.playing(video);
  advance(9000);
  blankFrame = false;
  drawNextFrame(0);
  expect(vi.getTimerCount()).toBe(0);
  rerender(<XiaoXMotion activity="complete" />);
  advance(30000);
  expect(container.querySelector('video')).toBe(video);
  fireEvent.ended(video);
  expect(shownActivity(container)).toBe('complete');
});

it('unblocks a failed load after ten seconds without repeatedly retrying failed clips', () => {
  blankFrame = true;
  const { container, rerender } = render(<XiaoXMotion activity="thinking" />);
  fireEvent.playing(container.querySelector('video')!);
  advance(9999);
  expect(shownActivity(container)).toBe('thinking');
  rerender(<XiaoXMotion activity="complete" />);
  advance(1);
  expect(shownActivity(container)).toBe('complete');
  advance(30000);
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
  expectVisibleHero(container);
});

it('ignores late play promises and frame callbacks from old video instances', async () => {
  const first = deferredPlay(), second = deferredPlay(), latest = deferredPlay();
  vi.mocked(HTMLMediaElement.prototype.play)
    .mockImplementationOnce(() => first.promise)
    .mockImplementationOnce(() => second.promise)
    .mockImplementationOnce(() => latest.promise);
  const { container, rerender } = render(<XiaoXMotion activity="searching" />);
  const firstVideo = container.querySelector('video')!;
  fireEvent.playing(firstVideo);
  const obsoleteFrame = [...frameCallbacks.values()][0];
  rerender(<XiaoXMotion activity="reviewing" />);
  fireEvent.ended(firstVideo);
  const secondVideo = container.querySelector('video')!;
  rerender(<XiaoXMotion activity="complete" />);
  fireEvent.ended(secondVideo);
  const report = container.querySelector('video');
  await act(async () => latest.resolve());
  displayContext.putImageData.mockClear();
  vi.mocked(HTMLMediaElement.prototype.pause).mockClear();
  await act(async () => { first.resolve(); second.reject(new Error('Obsolete load')); });
  act(() => obsoleteFrame(performance.now() + 100));
  fireEvent.ended(firstVideo);
  fireEvent.ended(secondVideo);
  expect(container.querySelector('video')).toBe(report);
  expect(displayContext.putImageData).not.toHaveBeenCalled();
  expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled();
  expect(frameCallbacks.size).toBe(1);
});

it('never displays raw video and writes genuine alpha pixels to the canvas', () => {
  const { container, unmount } = render(<XiaoXMotion activity="searching" />);
  const video = container.querySelector('video')!;
  expect(video.hidden).toBe(true);
  fireEvent.playing(video);
  const frame = displayContext.putImageData.mock.calls[0][0] as { data: Uint8ClampedArray };
  expect(frame.data[3]).toBe(0);
  expect(frame.data[(120 * 240 + 120) * 4 + 3]).toBe(255);
  const callback = [...frameCallbacks.values()][0];
  unmount();
  displayContext.putImageData.mockClear();
  act(() => callback(performance.now() + 100));
  expect(displayContext.putImageData).not.toHaveBeenCalled();
  expect(frameCallbacks.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

it('keeps the hero when autoplay or canvas access fails before any valid frame', async () => {
  vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'));
  const { container, unmount } = render(<XiaoXMotion activity="thinking" />);
  await act(async () => {});
  advance(30000);
  expectVisibleHero(container);
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
  unmount();
  vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValueOnce(null);
  const fallback = render(<XiaoXMotion activity="searching" />);
  expectVisibleHero(fallback.container);
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
});

it('pauses hidden playback and resumes the same video at its existing position', () => {
  const { container, rerender, unmount } = render(<XiaoXMotion activity="thinking" />);
  const video = container.querySelector('video')!;
  const canvas = container.querySelector('canvas');
  fireEvent.playing(video);
  video.currentTime = 4.25;
  const observer = MockIntersectionObserver.instances[0];
  act(() => observer.callback([{ isIntersecting: false }]));
  expect(container.querySelector('video')).toBe(video);
  expect(container.querySelector('canvas.is-playing')).toBe(canvas);
  expect(frameCallbacks.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  rerender(<XiaoXMotion activity="reviewing" />);
  rerender(<XiaoXMotion activity="complete" />);
  advance(120000);
  act(() => observer.callback([{ isIntersecting: true }]));
  expect(container.querySelector('video')).toBe(video);
  expect(video.currentTime).toBe(4.25);
  fireEvent.playing(video);
  expect(shownActivity(container)).toBe('reviewing');
  fireEvent.ended(video);
  expect(shownActivity(container)).toBe('complete');
  unmount();
  expect(observer.disconnect).toHaveBeenCalledOnce();
  expect(frameCallbacks.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

it('also pauses when the document is hidden and resumes without seeking', () => {
  const { container } = render(<XiaoXMotion activity="searching" />);
  const video = container.querySelector('video')!;
  fireEvent.playing(video);
  video.currentTime = 3;
  const visibility = vi.spyOn(document, 'visibilityState', 'get');
  visibility.mockReturnValue('hidden');
  fireEvent(document, new Event('visibilitychange'));
  advance(30000);
  expect(container.querySelector('video')).toBe(video);
  expect(frameCallbacks.size).toBe(0);
  visibility.mockReturnValue('visible');
  fireEvent(document, new Event('visibilitychange'));
  expect(container.querySelector('video')).toBe(video);
  expect(video.currentTime).toBe(3);
});

it('cancels native video frame callbacks on ending and ignores obsolete callback delivery', () => {
  const callbacks = new Map<number, VideoFrameRequestCallback>();
  let frameId = 0;
  Object.defineProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback', { configurable: true, value: vi.fn((callback: VideoFrameRequestCallback) => { callbacks.set(++frameId, callback); return frameId; }) });
  Object.defineProperty(HTMLVideoElement.prototype, 'cancelVideoFrameCallback', { configurable: true, value: vi.fn((id: number) => callbacks.delete(id)) });
  try {
    const { container, unmount } = render(<XiaoXMotion activity="complete" />);
    const video = container.querySelector('video')!;
    fireEvent.playing(video);
    const callback = [...callbacks.values()][0];
    expect(callbacks.size).toBe(1);
    fireEvent.ended(video);
    expect(callbacks.size).toBe(0);
    displayContext.putImageData.mockClear();
    act(() => callback(performance.now() + 100, {} as VideoFrameCallbackMetadata));
    expect(displayContext.putImageData).not.toHaveBeenCalled();
    unmount();
  } finally {
    delete (HTMLVideoElement.prototype as unknown as Record<string, unknown>).requestVideoFrameCallback;
    delete (HTMLVideoElement.prototype as unknown as Record<string, unknown>).cancelVideoFrameCallback;
  }
});

it('honors reduced motion and releases resources on a live preference change', () => {
  reducedMotion = true;
  const { container, rerender, unmount } = render(<XiaoXMotion activity="thinking" />);
  expectVisibleHero(container);
  expect(container.querySelector('video')).toBeNull();
  rerender(<XiaoXMotion activity="complete" />);
  expect(shownActivity(container)).toBe('complete');
  expect(vi.getTimerCount()).toBe(0);
  act(() => changeMotionPreference(false));
  const video = container.querySelector('video')!;
  fireEvent.playing(video);
  rerender(<XiaoXMotion activity="thinking" />);
  act(() => changeMotionPreference(true));
  expect(shownActivity(container)).toBe('thinking');
  expect(container.querySelector('video')).toBeNull();
  expectVisibleHero(container);
  expect(frameCallbacks.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  unmount();
  expect(preferenceListeners.size).toBe(0);
});

it('changes idle into searching without restarting the shared clip, then follows the searching playlist', () => {
  const { container, rerender } = render(<XiaoXMotion activity="idle" />);
  const video = container.querySelector('video')!;
  fireEvent.playing(video);
  video.currentTime = 3.5;
  rerender(<XiaoXMotion activity="searching" />);
  expect(shownActivity(container)).toBe('searching');
  expect(container.querySelector('video')).toBe(video);
  expect(video.currentTime).toBe(3.5);
  expect(video.loop).toBe(false);
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  expect(container.querySelector('.jw-xiaox-motion')?.getAttribute('data-motion-finished')).toBe('false');
  fireEvent.ended(video);
  expect(container.querySelector('video')?.getAttribute('src')).toBe('/videos/xiaox/photographing-evidence.mp4');
});

it('keeps a finished shared single clip, then advances instead of replaying it when idle resumes', () => {
  const { container, rerender } = render(<XiaoXMotion activity="listening" />);
  const video = container.querySelector('video')!;
  fireEvent.playing(video);
  video.currentTime = 8;
  fireEvent.ended(video);
  rerender(<XiaoXMotion activity="attention" />);
  expect(shownActivity(container)).toBe('attention');
  expect(container.querySelector('video')).toBe(video);
  expect(video.currentTime).toBe(8);
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  expect(container.querySelector('.jw-xiaox-motion')?.getAttribute('data-motion-finished')).toBe('true');
  rerender(<XiaoXMotion activity="idle" />);
  expect(shownActivity(container)).toBe('idle');
  expect(container.querySelector('video')?.getAttribute('src')).toBe('/videos/xiaox/sorting-clues.mp4');
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
});

it('keeps a static fallback after an idle-video error without retrying indefinitely', async () => {
  vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error('Video unavailable'));
  const { container, rerender } = render(<XiaoXMotion activity="idle" />);
  await act(async () => {});
  advance(30000);
  expectVisibleHero(container);
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  expect(frameCallbacks.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  rerender(<XiaoXMotion activity="searching" />);
  advance(350);
  expect(shownActivity(container)).toBe('searching');
  expect(container.querySelector('video')?.getAttribute('src')).toBe('/videos/xiaox/photographing-evidence.mp4');
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
});
