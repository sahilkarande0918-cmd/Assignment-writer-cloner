import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const tones = {
  neutral: "border-line-strong text-ink-2",
  pending: "border-dashed border-line-strong text-muted",
  ok: "border-ok/40 text-ok",
  warn: "border-warn/40 text-warn",
  danger: "border-danger/40 text-danger",
} as const;

export function Badge({ tone = "neutral", children, className, title }: { tone?: keyof typeof tones; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em]", tones[tone], className)}>
      {children}
    </span>
  );
}
