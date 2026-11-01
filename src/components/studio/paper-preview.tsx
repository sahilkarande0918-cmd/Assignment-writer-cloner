import { PAGE_MM, type LayoutSettings } from "@/lib/studio";

/** Vector preview of the blank sheet implied by the layout settings (paper-only layer). */
export function PaperPreview({ s, children, label = "Paper-only preview" }: { s: LayoutSettings; children?: React.ReactNode; label?: string }) {
  const { w, h } = PAGE_MM[s.pageSize];
  const rules: number[] = [];
  for (let y = s.marginTopMm; y <= h - 15; y += s.lineSpacingMm) rules.push(y);
  const grid = s.paper === "grid";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className="h-auto w-full bg-paper shadow-[0_24px_60px_-40px_rgba(27,26,24,0.55)]">
      {(s.paper === "ruled" || grid) &&
        rules.map((y) => <line key={y} x1={0} x2={w} y1={y} y2={y} stroke={grid ? "#cfdbe6" : "#b9cde0"} strokeWidth={0.25} />)}
      {grid &&
        Array.from({ length: Math.floor(w / s.lineSpacingMm) }, (_, i) => (i + 1) * s.lineSpacingMm).map((x) => (
          <line key={x} x1={x} x2={x} y1={0} y2={h} stroke="#cfdbe6" strokeWidth={0.25} />
        ))}
      {s.paper === "ruled" && <line x1={s.marginLeftMm - 4} x2={s.marginLeftMm - 4} y1={0} y2={h} stroke="#d98c8c" strokeWidth={0.35} />}
      {children}
    </svg>
  );
}
