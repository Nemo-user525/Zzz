/**
 * Remove the edge-connected paper from a pencil-animation frame. A small
 * ink barrier bridges tiny compression gaps without keying out the white face,
 * coat, or report enclosed by the drawing. Buffers are reused for every frame.
 */
export function createPaperMatte(width: number, height: number) {
  const count = width * height;
  const ink = new Uint8Array(count);
  const barrier = new Uint8Array(count);
  const outside = new Uint8Array(count);
  const transparent = new Uint8Array(count);
  const queue = new Int32Array(count);

  return (rgba: Uint8ClampedArray): number => {
    if (rgba.length !== count * 4) throw new Error('Unexpected animation frame dimensions');
    ink.fill(0);
    barrier.fill(0);
    outside.fill(0);
    transparent.fill(0);

    let paperSum = 0;
    let paperSamples = 0;
    const samplePaper = (pixel: number) => {
      const offset = pixel * 4;
      const low = Math.min(rgba[offset], rgba[offset + 1], rgba[offset + 2]);
      const high = Math.max(rgba[offset], rgba[offset + 1], rgba[offset + 2]);
      if (low >= 180 && high - low < 40) {
        paperSum += (rgba[offset] + rgba[offset + 1] + rgba[offset + 2]) / 3;
        paperSamples++;
      }
    };
    for (let x = 0; x < width; x += 4) {
      samplePaper(x);
      samplePaper((height - 1) * width + x);
    }
    for (let y = 0; y < height; y += 4) {
      samplePaper(y * width);
      samplePaper(y * width + width - 1);
    }
    const paper = paperSamples ? paperSum / paperSamples : 245;
    // The source animation uses very faint pencil lines around the coat hem.
    // Keep those lines in the connectivity barrier, including compressed edges.
    const inkThreshold = Math.max(180, paper - 30);
    const sealRadius = 2;

    for (let pixel = 0; pixel < count; pixel++) {
      const offset = pixel * 4;
      const low = Math.min(rgba[offset], rgba[offset + 1], rgba[offset + 2]);
      const high = Math.max(rgba[offset], rgba[offset + 1], rgba[offset + 2]);
      const luminance = (rgba[offset] + rgba[offset + 1] + rgba[offset + 2]) / 3;
      ink[pixel] = rgba[offset + 3] > 0 && (luminance < inkThreshold || high - low > 48) ? 1 : 0;
    }

    // Dilate the ink for the flood barrier only; do not thicken the actual art.
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixel = y * width + x;
        if (!ink[pixel]) continue;
        for (let dy = -sealRadius; dy <= sealRadius; dy++) {
          if (y + dy < 0 || y + dy >= height) continue;
          for (let dx = -sealRadius; dx <= sealRadius; dx++) {
            if (x + dx >= 0 && x + dx < width) barrier[pixel + dy * width + dx] = 1;
          }
        }
      }
    }

    let head = 0;
    let tail = 0;
    const enqueue = (pixel: number) => {
      if (!outside[pixel] && !barrier[pixel]) {
        outside[pixel] = 1;
        queue[tail++] = pixel;
      }
    };
    // These clips crop the white coat at the bottom of the frame. Seeding every
    // border pixel would incorrectly start a background flood inside that coat.
    // Only the four paper corners are known background; their connected regions
    // still reach all exterior paper, including either side of a cropped dog.
    enqueue(0);
    enqueue(width - 1);
    enqueue((height - 1) * width);
    enqueue(count - 1);
    while (head < tail) {
      const pixel = queue[head++];
      const x = pixel % width;
      if (x > 0) enqueue(pixel - 1);
      if (x + 1 < width) enqueue(pixel + 1);
      if (pixel >= width) enqueue(pixel - width);
      if (pixel + width < count) enqueue(pixel + width);
    }

    // Undo the outer half of the barrier expansion so no paper halo remains.
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixel = y * width + x;
        if (!outside[pixel]) continue;
        transparent[pixel] = 1;
        for (let dy = -sealRadius; dy <= sealRadius; dy++) {
          if (y + dy < 0 || y + dy >= height) continue;
          for (let dx = -sealRadius; dx <= sealRadius; dx++) {
            if (x + dx < 0 || x + dx >= width) continue;
            const neighbor = pixel + dy * width + dx;
            if (!ink[neighbor]) transparent[neighbor] = 1;
          }
        }
      }
    }

    let foregroundPixels = 0;
    for (let pixel = 0; pixel < count; pixel++) {
      const offset = pixel * 4;
      if (transparent[pixel]) {
        rgba[offset + 3] = 0;
        continue;
      }
      const x = pixel % width;
      const atEdge = (x > 0 && transparent[pixel - 1])
        || (x + 1 < width && transparent[pixel + 1])
        || (pixel >= width && transparent[pixel - width])
        || (pixel + width < count && transparent[pixel + width]);
      if (ink[pixel] && atEdge) {
        // Decontaminate the antialiased ink edge from its original pale paper.
        const luminance = (rgba[offset] + rgba[offset + 1] + rgba[offset + 2]) / 3;
        rgba[offset + 3] = Math.round(rgba[offset + 3] * Math.max(0, 1 - luminance / paper));
        rgba[offset] = rgba[offset + 1] = rgba[offset + 2] = 0;
      }
      if (rgba[offset + 3]) foregroundPixels++;
    }
    return foregroundPixels;
  };
}
