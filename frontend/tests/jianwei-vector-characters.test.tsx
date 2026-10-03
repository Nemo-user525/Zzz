import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { JianweiObserverVideo } from '../src/JianweiObserverVideo';
import { JianweiActionSprite } from '../src/JianweiActionSprite';
import { JianweiPerson } from '../src/JianweiPeople';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function motion(reduced: boolean) {
  vi.stubGlobal('IntersectionObserver', undefined);
  vi.stubGlobal('matchMedia', () => ({ matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
}

it('ships only real path geometry, with sixty distinct performance frames', () => {
  const directory = resolve('public/images/vectors');
  const files = readdirSync(directory).filter(name => name.endsWith('.svg'));
  expect(files.length).toBe(9);
  for (const file of files) {
    const svg = readFileSync(resolve(directory, file), 'utf8');
    expect(svg).toContain('<path');
    expect(svg).not.toMatch(/<(?:image|foreignObject)|data:image|base64|\.png|\.jpe?g/i);
  }
  const manifest = JSON.parse(readFileSync(resolve(directory, 'manifest.json'), 'utf8'));
  const performance = manifest.assets.find((item: { file: string }) => item.file.endsWith('observer-performance.svg'));
  expect(performance.frames).toBe(60);
  expect(performance.unique_frames).toBe(60);
  expect(performance.fps).toBe(12);
});

it('changes the girls vector paths over time while keeping the SVG stage fixed', () => {
  motion(false);
  const { container } = render(<JianweiObserverVideo />);
  const first = container.querySelector('use')!.getAttribute('href');
  act(() => { vi.advanceTimersByTime(1100); });
  expect(container.querySelector('use')!.getAttribute('href')).not.toBe(first);
  expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 720 720');
  expect(container.querySelector('video,img,image')).toBeNull();
});

it('honors reduced motion without starting a frame timer', () => {
  motion(true);
  const { container } = render(<><JianweiObserverVideo /><JianweiActionSprite kind="researcher" /></>);
  act(() => { vi.advanceTimersByTime(4000); });
  expect([...container.querySelectorAll('use')].every(element => element.getAttribute('href')!.endsWith('#frame-0'))).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it('retains separately articulated team head and hand with path references', () => {
  motion(false);
  const { container } = render(<JianweiPerson role="detective" variant="team" />);
  const manifest = JSON.parse(readFileSync(resolve('public/images/vectors/manifest.json'), 'utf8'));
  const version = manifest.assets.find((asset: { file: string }) => asset.file === '/images/vectors/people.svg').sha256.slice(0, 12);
  expect(container.querySelector('.jw-person-joint--head use')).toBeTruthy();
  expect(container.querySelector('.jw-person-joint--hand use')).toBeTruthy();
  expect([...container.querySelectorAll('use')].every(element => element.getAttribute('href') === `/images/vectors/people.svg?v=${version}#team-detective`)).toBe(true);
  expect(container.querySelector('image,img')).toBeNull();
});
