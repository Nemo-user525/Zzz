import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useDraggableCompanion } from '../src/useDraggableCompanion';

class VisibleViewport extends EventTarget {
  width = 1024;
  height = 768;
  offsetLeft = 0;
  offsetTop = 0;
}

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly isPrimary = true;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
  }
}

function Harness() {
  const drag = useDraggableCompanion(true);
  return <aside ref={drag.companionRef} style={drag.positionStyle} data-testid="companion">
    <section ref={drag.panelRef} style={drag.panelStyle} data-testid="voice-panel" />
    <button {...drag.pointerHandlers}>Drag</button>
  </aside>;
}

let visible: VisibleViewport;
const rect = (x: number, y: number, width: number, height: number): DOMRect => ({
  x, y, width, height, left: x, top: y, right: x + width, bottom: y + height,
  toJSON: () => ({}),
});

beforeEach(() => {
  sessionStorage.clear();
  visible = new VisibleViewport();
  vi.stubGlobal('visualViewport', visible);
  vi.stubGlobal('innerWidth', 1024);
  vi.stubGlobal('innerHeight', 768);
  vi.stubGlobal('PointerEvent', TestPointerEvent);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.dataset.testid === 'companion') {
      return rect(parseFloat(this.style.left) || 850, parseFloat(this.style.top) || 610, 144, 144);
    }
    if (this.dataset.testid === 'voice-panel') {
      return rect(parseFloat(this.style.left) || 0, parseFloat(this.style.top) || 0,
        parseFloat(this.style.width) || 340, Math.min(420, parseFloat(this.style.maxHeight) || 420));
    }
    return rect(0, 0, 0, 0);
  });
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function expectVisible() {
  const panel = screen.getByTestId('voice-panel');
  const bounds = panel.getBoundingClientRect();
  expect(bounds.left).toBeGreaterThanOrEqual(visible.offsetLeft + 12);
  expect(bounds.right).toBeLessThanOrEqual(visible.offsetLeft + visible.width - 12);
  expect(bounds.top).toBeGreaterThanOrEqual(visible.offsetTop + 12);
  expect(bounds.bottom).toBeLessThanOrEqual(visible.offsetTop + visible.height - 12);
  return panel;
}

it('starts at the bottom right even when a stale top-left position was saved', () => {
  sessionStorage.setItem('xiaox-companion-position-v2', JSON.stringify({ x: 12, y: 32 }));
  const { unmount } = render(<Harness />);
  let bounds = screen.getByTestId('companion').getBoundingClientRect();
  expect(bounds.right).toBe(1024 - 22);
  expect(bounds.bottom).toBe(768 - 88);
  const dog = screen.getByRole('button', { name: 'Drag' });
  fireEvent.pointerDown(dog, { pointerId: 1, button: 0, clientX: bounds.left + 20, clientY: bounds.top + 20 });
  fireEvent.pointerMove(dog, { pointerId: 1, buttons: 1, clientX: 0, clientY: 0 });
  fireEvent.pointerUp(dog, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
  expect(screen.getByTestId('companion').getBoundingClientRect().left).toBe(12);
  unmount();
  render(<Harness />);
  bounds = screen.getByTestId('companion').getBoundingClientRect();
  expect(bounds.right).toBe(1024 - 22);
  expect(bounds.bottom).toBe(768 - 88);
});

it('keeps the default corner anchor when the viewport grows after being small', () => {
  visible.width = 390;
  visible.height = 500;
  render(<Harness />);
  visible.width = 1440;
  visible.height = 900;
  fireEvent(visible, new Event('resize'));
  const bounds = screen.getByTestId('companion').getBoundingClientRect();
  expect(bounds.right).toBe(1440 - 22);
  expect(bounds.bottom).toBe(900 - 88);
});

it('keeps the voice editor and its scrollable actions above the mobile keyboard', () => {
  render(<Harness />);
  expectVisible();
  visible.width = 390;
  visible.height = 310;
  visible.offsetTop = 190;
  // Mobile keyboards may change only visualViewport; window.innerHeight stays unchanged.
  fireEvent(visible, new Event('resize'));
  const panel = expectVisible();
  expect(panel.style.width).toBe('340px');
  expect(panel.style.maxHeight).toBe('286px');
  const dog = screen.getByTestId('companion').getBoundingClientRect();
  expect(dog.bottom).toBeLessThanOrEqual(488);
  expect(dog.top).toBeGreaterThanOrEqual(222);
});

it('tracks visual viewport panning and constrains dragging in layout coordinates', () => {
  visible.width = 300;
  visible.height = 500;
  visible.offsetLeft = 90;
  visible.offsetTop = 140;
  render(<Harness />);
  expectVisible();
  visible.offsetLeft = 210;
  visible.offsetTop = 330;
  fireEvent(visible, new Event('scroll'));
  expectVisible();

  const dog = screen.getByRole('button', { name: 'Drag' });
  const before = screen.getByTestId('companion').getBoundingClientRect();
  fireEvent.pointerDown(dog, { pointerId: 1, button: 0, clientX: before.left + 20, clientY: before.top + 20 });
  fireEvent.pointerMove(dog, { pointerId: 1, buttons: 1, clientX: -500, clientY: -500 });
  fireEvent.pointerUp(dog, { pointerId: 1, button: 0, clientX: -500, clientY: -500 });
  const after = screen.getByTestId('companion').getBoundingClientRect();
  expect(after.left).toBe(222);
  expect(after.top).toBe(362);
  expectVisible();
});

it('falls back to the layout viewport when visualViewport is unavailable', () => {
  vi.stubGlobal('visualViewport', undefined);
  render(<Harness />);
  vi.stubGlobal('innerWidth', 320);
  vi.stubGlobal('innerHeight', 280);
  fireEvent(window, new Event('resize'));
  const panel = screen.getByTestId('voice-panel').getBoundingClientRect();
  expect(panel.left).toBeGreaterThanOrEqual(12);
  expect(panel.right).toBeLessThanOrEqual(308);
  expect(panel.top).toBeGreaterThanOrEqual(12);
  expect(panel.bottom).toBeLessThanOrEqual(268);
});

it('removes visual viewport listeners when the companion unmounts', () => {
  const remove = vi.spyOn(visible, 'removeEventListener');
  const { unmount } = render(<Harness />);
  unmount();
  expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
  expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function));
});
