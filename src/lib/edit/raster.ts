// Reconstruction edits for scans and photos (never exact). Ink inside the edited line box is
// removed and back-filled from the surrounding paper, while long ruled/margin lines are protected;
// the new text is then drawn once on top. Pure pixel functions are separated for testing.
import type { Box } from "../doc/model";

export type Rgba = { data: Uint8ClampedArray; width: number; height: number };

const lum = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

function median(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : 255;
}

/** Rows/columns that are mostly non-paper across the whole page = ruling or margin lines. */
export function protectedLines(img: Rgba, paperLum: number) {
  const { data, width, height } = img;
  const dark = (i: number) => paperLum - lum(data, i) > 18;
  const rows = new Set<number>();
  const cols = new Set<number>();
  for (let y = 0; y < height; y++) {
    let n = 0;
    for (let x = 0; x < width; x += 2) if (dark((y * width + x) * 4)) n++;
    if (n / (width / 2) > 0.5) rows.add(y);
  }
  for (let x = 0; x < width; x++) {
    let n = 0;
    for (let y = 0; y < height; y += 2) if (dark((y * width + x) * 4)) n++;
    if (n / (height / 2) > 0.5) cols.add(x);
  }
  return { rows, cols };
}

/** Remove ink in `box` (pixel units). Returns the estimated ink colour and how many pixels changed. */
export function eraseInk(img: Rgba, box: Box, pad = 3) {
  const { data, width, height } = img;
  const x0 = Math.max(0, Math.floor(box.x - pad)), y0 = Math.max(0, Math.floor(box.y - pad));
  const x1 = Math.min(width - 1, Math.ceil(box.x + box.w + pad)), y1 = Math.min(height - 1, Math.ceil(box.y + box.h + pad));
  // Paper colour from a ring just outside the box.
  const ring: number[][] = [];
  for (let x = x0; x <= x1; x++) for (const y of [Math.max(0, y0 - 2), Math.min(height - 1, y1 + 2)]) ring.push([...data.slice((y * width + x) * 4, (y * width + x) * 4 + 3)]);
  const paper = [0, 1, 2].map((k) => median(ring.map((p) => p[k])));
  const paperLum = 0.299 * paper[0] + 0.587 * paper[1] + 0.114 * paper[2];
  const { rows, cols } = protectedLines(img, paperLum);

  const mask = new Uint8Array((x1 - x0 + 1) * (y1 - y0 + 1));
  const ink: number[][] = [];
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (rows.has(y) || cols.has(x)) continue;
      const i = (y * width + x) * 4;
      if (paperLum - lum(data, i) > 40) {
        mask[(y - y0) * (x1 - x0 + 1) + (x - x0)] = 1;
        ink.push([data[i], data[i + 1], data[i + 2]]);
      }
    }
  // Grow the mask by one pixel to catch anti-aliased ink edges.
  const grown = mask.slice();
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (mask[y * w + x]) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && !rows.has(ny + y0) && !cols.has(nx + x0)) grown[ny * w + nx] = 1;
      }
  let changed = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!grown[y * w + x]) continue;
      const i = ((y + y0) * width + (x + x0)) * 4;
      // Fill from the nearest unmasked, unprotected pixel in the same column (keeps paper texture/shading).
      let src = -1;
      for (let d = 1; d < h && src < 0; d++)
        for (const yy of [y - d, y + d])
          if (yy >= 0 && yy < h && !grown[yy * w + x] && !rows.has(yy + y0)) {
            src = ((yy + y0) * width + (x + x0)) * 4;
            break;
          }
      if (src >= 0) data.set(data.slice(src, src + 3), i);
      else data.set(paper, i);
      changed++;
    }
  const inkColor = ink.length ? [0, 1, 2].map((k) => median(ink.map((p) => p[k]))) : [30, 30, 30];
  return { changed, inkColor, protectedRows: rows.size, protectedCols: cols.size };
}

/** Browser: erase + redraw one line on a canvas. `scale` maps document units to canvas pixels. */
export function redrawLine(ctx: CanvasRenderingContext2D, box: Box, text: string, scale: number) {
  const px = { x: box.x * scale, y: box.y * scale, w: box.w * scale, h: box.h * scale };
  const img = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const { inkColor } = eraseInk({ data: img.data, width: img.width, height: img.height }, px);
  ctx.putImageData(img, 0, 0);
  if (!text) return;
  const size = px.h * 0.82;
  ctx.font = `${size}px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = `rgb(${inkColor.join(",")})`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, px.x, px.y + px.h * 0.85);
  return { overflow: px.x + ctx.measureText(text).width > ctx.canvas.width };
}
