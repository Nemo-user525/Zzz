import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { JianweiDate } from '../src/JianweiDate';

afterEach(() => { cleanup(); vi.useRealTimers(); });

it('shows the Shanghai calendar day, including after midnight while UTC is still yesterday', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-03T16:01:00Z'));
  render(<JianweiDate/>);
  const date = screen.getByLabelText('今日日期 2026年10月4日');
  expect(date.tagName).toBe('TIME');
  expect(date.getAttribute('datetime')).toBe('2026-10-04');
  expect(date.textContent).toBe('2026 / 10 / 04');
});

it('updates an open page across midnight and clears its refresh timer on unmount', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-03T15:59:30Z'));
  const { unmount } = render(<JianweiDate/>);
  expect(screen.getByText('2026 / 10 / 03')).toBeTruthy();
  act(() => { vi.advanceTimersByTime(60_000); });
  expect(screen.getByText('2026 / 10 / 04')).toBeTruthy();
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it('refreshes immediately when a suspended page becomes visible or focused', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-03T12:00:00Z'));
  render(<JianweiDate/>);
  act(() => {
    vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(screen.getByText('2026 / 10 / 04')).toBeTruthy();
  act(() => {
    vi.setSystemTime(new Date('2026-10-05T12:00:00Z'));
    window.dispatchEvent(new Event('focus'));
  });
  expect(screen.getByText('2026 / 10 / 05')).toBeTruthy();
});
