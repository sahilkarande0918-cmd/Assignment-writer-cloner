// Performance budget check (production build). Records transfer sizes and LCP; fails only on clear regressions.
import { expect, test } from "@playwright/test";

test.skip(({ isMobile }) => isMobile, "Measured once on desktop.");

for (const route of ["/", "/studio"]) {
  test(`${route} stays within budget`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    const m = await page.evaluate(async () => {
      const res = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
      const js = res.filter((r) => r.initiatorType === "script" || r.name.endsWith(".js"));
      const lcp = await new Promise<number>((resolve) => {
        new PerformanceObserver((l) => resolve(l.getEntries().at(-1)!.startTime)).observe({ type: "largest-contentful-paint", buffered: true });
        setTimeout(() => resolve(-1), 3000);
      });
      return { jsKB: Math.round(js.reduce((n, r) => n + r.transferSize, 0) / 1024), totalKB: Math.round(res.reduce((n, r) => n + r.transferSize, 0) / 1024), lcp: Math.round(lcp) };
    });
    console.log(`${route}: JS ${m.jsKB} KB, total ${m.totalKB} KB, LCP ${m.lcp} ms`);
    // Heavy engines (MuPDF 10 MB wasm, PDF.js, Tesseract, three.js) must stay lazy: never part of the initial load.
    expect(m.jsKB).toBeLessThan(900);
    expect(m.totalKB).toBeLessThan(2500);
  });
}
