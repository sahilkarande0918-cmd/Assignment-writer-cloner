"use client";
import { useId, useState } from "react";

// Illustration only: shows the idea of a targeted edit on a ruled page.
function Sheet({ edited }: { edited: boolean }) {
  const mark = edited ? "rounded-sm bg-[#efe3cf]/70" : "";
  return (
    <div className="paper-ruled absolute inset-0 px-[16%] pt-[40px] font-display text-[19px] leading-[28px] text-[#22324d] italic">
      <p>Experiment No. 4 — Ohm&apos;s Law</p>
      <p>
        Name: <span className={mark}>{edited ? "Sahil Karande" : "A. Kulkarni"}</span>
      </p>
      <p>
        PRN: <span className={mark}>{edited ? "22010418" : "22010173"}</span>
      </p>
      <p>&nbsp;</p>
      <p>Aim: To verify the relation</p>
      <p>between voltage and current</p>
      <p>across a fixed resistor.</p>
      <p>&nbsp;</p>
      <p>Apparatus: battery, rheostat,</p>
      <p>ammeter, voltmeter, resistor.</p>
    </div>
  );
}

export function BeforeAfter() {
  const [pos, setPos] = useState(30);
  const id = useId();
  return (
    <figure className="w-full">
      <div className="relative mx-auto aspect-[1/1.25] w-full max-w-[520px] overflow-hidden rounded-sm border border-line shadow-[0_40px_80px_-50px_rgba(27,26,24,0.5)]">
        <Sheet edited={false} />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>
          <Sheet edited />
        </div>
        <div className="absolute inset-y-0 w-px bg-ink" style={{ left: `${pos}%` }} aria-hidden />
        <span className="absolute left-3 top-3 rounded-full bg-paper/90 px-2 py-0.5 text-[11px] uppercase tracking-widest text-ink-2">Original</span>
        <span className="absolute right-3 top-3 rounded-full bg-paper/90 px-2 py-0.5 text-[11px] uppercase tracking-widest text-ink-2">Edited</span>
      </div>
      <label htmlFor={id} className="sr-only">
        Compare original and edited page
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        className="mx-auto mt-6 block w-full max-w-[520px] accent-[var(--color-bronze)]"
      />
      <figcaption className="mt-3 text-center text-sm text-muted">
        Illustration. Only the name and PRN change; ruling, margin and the rest of the page stay untouched.
      </figcaption>
    </figure>
  );
}
