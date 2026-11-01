import { describe, expect, it } from "vitest";
import { eraseInk } from "@/lib/edit/raster";

/** 200×100 ruled "page": paper, blue rule at y=60, red margin at x=20, black ink block over the rule. */
function page() {
  const width = 200, height = 100;
  const data = new Uint8ClampedArray(width * height * 4);
  const set = (x: number, y: number, c: number[]) => data.set([...c, 255], (y * width + x) * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) set(x, y, [250, 248, 240]);
  for (let x = 0; x < width; x++) set(x, 60, [150, 180, 215]);
  for (let y = 0; y < height; y++) set(20, y, [215, 120, 120]);
  for (let y = 45; y < 65; y++) for (let x = 40; x < 90; x++) if (y !== 60 && (x + y) % 3) set(x, y, [25, 35, 80]);
  return { data, width, height };
}
const px = (img: ReturnType<typeof page>, x: number, y: number) => Array.from(img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 3));

describe("eraseInk", () => {
  it("removes ink in the box, keeps the ruled line, and never touches pixels outside the box", () => {
    const img = page();
    const before = img.data.slice();
    const r = eraseInk(img, { x: 40, y: 45, w: 50, h: 20 });
    expect(r.changed).toBeGreaterThan(500);
    expect(r.inkColor).toEqual([25, 35, 80]);
    expect(r.protectedRows).toBe(1);
    expect(r.protectedCols).toBe(1);
    expect(px(img, 50, 50)).toEqual([250, 248, 240]); // ink gone
    expect(px(img, 50, 60)).toEqual([150, 180, 215]); // rule kept
    for (let y = 0; y < img.height; y++)
      for (let x = 0; x < img.width; x++) {
        const inside = x >= 37 && x <= 93 && y >= 42 && y <= 68;
        if (inside) continue;
        const i = (y * img.width + x) * 4;
        expect(img.data[i], `pixel ${x},${y}`).toBe(before[i]);
      }
  });
});
