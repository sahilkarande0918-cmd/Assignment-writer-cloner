"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const HeroScene = dynamic(() => import("./hero-scene"), { ssr: false });

// Loads the WebGL scene only when motion is allowed and the device can afford it;
// otherwise the static CSS paper stack (always rendered underneath) stands in.
export function HeroBackdrop() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lowPower = (navigator.hardwareConcurrency ?? 8) < 4 || window.innerWidth < 768; // phones: static fallback
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    let gl = false;
    try {
      gl = !!document.createElement("canvas").getContext("webgl2");
    } catch {}
    if (reduce || lowPower || saveData || !gl) return;
    // Defer the WebGL bundle until the browser is idle so it never blocks first paint.
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 300));
    idle(() => setEnabled(true));
  }, []);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute right-[-6%] top-[18%] hidden h-[420px] w-[300px] rotate-[8deg] rounded-sm shadow-[0_30px_60px_-30px_rgba(27,26,24,0.35)] paper-ruled md:block" />
      <div className="absolute right-[14%] top-[30%] hidden h-[380px] w-[270px] -rotate-[5deg] rounded-sm shadow-[0_30px_60px_-30px_rgba(27,26,24,0.35)] paper-ruled lg:block" />
      {enabled && (
        <div className="absolute inset-0 bg-ivory">
          <HeroScene />
        </div>
      )}
      <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-ivory via-ivory/80 to-transparent md:w-[62%]" />
    </div>
  );
}
