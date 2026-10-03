import { expect, it } from 'vitest';
import { createPaperMatte } from '../src/xiaoxTransparency';

const size = 17;
function pencilFrame() {
  const frame = new Uint8ClampedArray(size * size * 4);
  for (let pixel = 0; pixel < size * size; pixel++) frame.set([246, 242, 235, 255], pixel * 4);
  for (let y = 5; y <= 11; y++) {
    for (let x = 5; x <= 11; x++) {
      frame.set(x === 5 || x === 11 || y === 5 || y === 11 ? [0, 0, 0, 255] : [255, 255, 255, 255], (y * size + x) * 4);
    }
  }
  return frame;
}

function pixelAt(frame: Uint8ClampedArray, x: number, y: number) {
  return Array.from(frame.slice((y * size + x) * 4, (y * size + x + 1) * 4));
}

function composite(pixel: number[], background: number[]) {
  const alpha = pixel[3] / 255;
  return background.map((color, channel) => Math.round(pixel[channel] * alpha + color * (1 - alpha)));
}

it.each([{ background: [0, 0, 0] }, { background: [20, 85, 190] }, { background: [230, 140, 80] }])('reveals a $background backdrop outside the drawing while retaining opaque white face and coat pixels', ({ background }) => {
  const frame = pencilFrame();
  createPaperMatte(size, size)(frame);

  for (const [x, y] of [[0, 0], [16, 16], [8, 3], [3, 8], [13, 8]]) {
    const outside = pixelAt(frame, x, y);
    expect(outside[3]).toBe(0);
    expect(composite(outside, background)).toEqual(background);
  }
  expect(pixelAt(frame, 8, 8)).toEqual([255, 255, 255, 255]);
  expect(composite(pixelAt(frame, 8, 8), background)).toEqual([255, 255, 255]);
  expect(pixelAt(frame, 5, 8)).toEqual([0, 0, 0, 255]);
});

it('bridges a small compression gap in the outline without erasing the enclosed white body', () => {
  const frame = pencilFrame();
  frame.set([246, 242, 235, 255], (5 * size + 8) * 4);
  createPaperMatte(size, size)(frame);
  expect(pixelAt(frame, 8, 8)).toEqual([255, 255, 255, 255]);
  expect(pixelAt(frame, 0, 0)[3]).toBe(0);
});

it('removes the pale fringe from an antialiased pencil edge on a dark backdrop', () => {
  const frame = pencilFrame();
  frame.set([165, 165, 165, 255], (8 * size + 4) * 4);
  createPaperMatte(size, size)(frame);
  const edge = pixelAt(frame, 4, 8);
  expect(edge.slice(0, 3)).toEqual([0, 0, 0]);
  expect(edge[3]).toBeGreaterThan(0);
  expect(edge[3]).toBeLessThan(128);
  expect(composite(edge, [0, 0, 0])).toEqual([0, 0, 0]);
});

it('reuses buffers without retaining a previous frame mask', () => {
  const matte = createPaperMatte(size, size);
  expect(matte(pencilFrame())).toBeGreaterThan(0);
  const blank = new Uint8ClampedArray(size * size * 4).fill(255);
  expect(matte(blank)).toBe(0);
  for (let index = 3; index < blank.length; index += 4) expect(blank[index]).toBe(0);
});
