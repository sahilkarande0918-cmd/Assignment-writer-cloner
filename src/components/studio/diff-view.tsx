"use client";
import { useEffect, useRef, useState } from "react";

async function load(url: string) {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

/** Pixel diff of two page renders: unchanged areas fade out, changed pixels are painted red. */
export function DiffView({ before, after, label }: { before: string; after: string; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [stat, setStat] = useState<string>();
  useEffect(() => {
    let live = true;
    Promise.all([load(before), load(after)]).then(([a, b]) => {
      const c = ref.current;
      if (!live || !c) return;
      [c.width, c.height] = [a.naturalWidth, a.naturalHeight];
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(a, 0, 0);
      const pa = ctx.getImageData(0, 0, c.width, c.height);
      ctx.drawImage(b, 0, 0, c.width, c.height);
      const pb = ctx.getImageData(0, 0, c.width, c.height);
      let changed = 0;
      for (let i = 0; i < pa.data.length; i += 4) {
        const d = Math.abs(pa.data[i] - pb.data[i]) + Math.abs(pa.data[i + 1] - pb.data[i + 1]) + Math.abs(pa.data[i + 2] - pb.data[i + 2]);
        if (d > 40) {
          changed++;
          pb.data.set([214, 40, 40], i);
        } else for (let k = 0; k < 3; k++) pb.data[i + k] = 255 - (255 - pb.data[i + k]) * 0.25;
      }
      ctx.putImageData(pb, 0, 0);
      setStat(`${((changed / (c.width * c.height)) * 100).toFixed(2)}% of pixels changed on this page`);
    });
    return () => {
      live = false;
    };
  }, [before, after]);
  return (
    <div>
      <canvas ref={ref} role="img" aria-label={label} className="block w-full bg-paper" />
      <p className="mt-2 text-xs text-muted" aria-live="polite">
        {stat ?? "Comparing…"} — red marks every changed pixel.
      </p>
    </div>
  );
}
