import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JianweiOpening, shouldShowOpening } from '../src/JianweiOpening';

let reducedMotion: MediaQueryList;

beforeEach(() => {
  vi.useFakeTimers();
  const events = new EventTarget();
  reducedMotion = {
    matches: false,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  } as MediaQueryList;
  vi.stubGlobal('matchMedia', vi.fn(() => reducedMotion));
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.style.overflow = '';
});

describe('opening eligibility', () => {
  it('plays on home entry without interrupting deep links', () => {
    expect(shouldShowOpening('/')).toBe(true);
    expect(shouldShowOpening('/index.html')).toBe(true);
    for (const path of ['/method', '/search', '/report', '/index.html/method']) {
      expect(shouldShowOpening(path)).toBe(false);
    }
  });

  it('bypasses the animation when the visitor requests reduced motion', () => {
    Object.defineProperty(reducedMotion, 'matches', { value: true });
    expect(shouldShowOpening('/')).toBe(false);
    expect(shouldShowOpening('/index.html')).toBe(false);
  });

  it('can enter on browsers without a media preference API', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(shouldShowOpening('/')).toBe(true);
  });
});

describe('opening lifecycle', () => {
  it('plays a silent inline video once without a visible skip control', () => {
    const { container } = render(<JianweiOpening onComplete={vi.fn()} />);
    const video = container.querySelector('video')!;
    expect(video.getAttribute('src')).toBe('/videos/jianwei-opening-dog-centered.mp4');
    expect(video.muted).toBe(true);
    expect(video.autoplay).toBe(true);
    expect(video.playsInline).toBe(true);
    expect(video.loop).toBe(false);
    expect(screen.queryByRole('button', { name: '跳过开场动画' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('dialog', { name: '见微开场动画' }));
  });

  it('keeps normal playback visible until the first ending event', () => {
    const complete = vi.fn();
    const { container } = render(<JianweiOpening onComplete={complete} />);
    const video = container.querySelector('video')!;
    const dialog = screen.getByRole('dialog', { name: '见微开场动画' });
    fireEvent.play(video);
    act(() => vi.advanceTimersByTime(8050));
    expect(dialog.getAttribute('data-phase')).toBe('playing');
    expect(complete).not.toHaveBeenCalled();
    fireEvent.ended(video);
    expect(dialog.getAttribute('data-phase')).toBe('leaving');
    act(() => vi.advanceTimersByTime(250));
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it.each(['ended', 'Escape', 'error'] as const)(
    'releases the page after %s and a short exit transition', trigger => {
      const complete = vi.fn();
      const { container } = render(<JianweiOpening onComplete={complete} />);
      const dialog = screen.getByRole('dialog', { name: '见微开场动画' });
      if (trigger === 'Escape') fireEvent.keyDown(dialog, { key: 'Escape' });
      else fireEvent(container.querySelector('video')!, new Event(trigger));

      expect(dialog.getAttribute('data-phase')).toBe('leaving');
      expect(complete).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(249));
      expect(complete).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1));
      expect(complete).toHaveBeenCalledTimes(1);

      // Late media events must not complete an already dismissed opening twice.
      fireEvent.error(container.querySelector('video')!);
      fireEvent.ended(container.querySelector('video')!);
      fireEvent.keyDown(dialog, { key: 'Escape' });
      act(() => vi.advanceTimersByTime(15000));
      expect(complete).toHaveBeenCalledTimes(1);
    },
  );

  it('cannot trap the visitor when playback stalls without a media event', () => {
    const complete = vi.fn();
    render(<JianweiOpening onComplete={complete} />);
    act(() => vi.advanceTimersByTime(9999));
    expect(complete).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog').getAttribute('data-phase')).toBe('playing');
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('dialog').getAttribute('data-phase')).toBe('leaving');
    act(() => vi.advanceTimersByTime(250));
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('continues into the site if the browser rejects autoplay', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error('Autoplay blocked'));
    const complete = vi.fn();
    render(<JianweiOpening onComplete={complete} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole('dialog').getAttribute('data-phase')).toBe('leaving');
    act(() => vi.advanceTimersByTime(250));
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('closes when reduced motion is enabled while the animation is playing', () => {
    const complete = vi.fn();
    render(<JianweiOpening onComplete={complete} />);
    Object.defineProperty(reducedMotion, 'matches', { value: true });
    act(() => reducedMotion.dispatchEvent(new Event('change')));
    expect(screen.getByRole('dialog').getAttribute('data-phase')).toBe('leaving');
    act(() => vi.advanceTimersByTime(250));
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('contains keyboard focus and restores the previous focus and scroll style on unmount', () => {
    const previous = document.createElement('button');
    document.body.appendChild(previous);
    previous.focus();
    document.body.style.overflow = 'clip';
    const { unmount } = render(<JianweiOpening onComplete={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: '见微开场动画' });
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(dialog);
    unmount();
    expect(document.body.style.overflow).toBe('clip');
    expect(document.activeElement).toBe(previous);
    previous.remove();
  });

  it('cancels pending completion when its owner unmounts the overlay', () => {
    const complete = vi.fn();
    const { unmount } = render(<JianweiOpening onComplete={complete} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    unmount();
    act(() => vi.advanceTimersByTime(15000));
    expect(complete).not.toHaveBeenCalled();
  });
});
