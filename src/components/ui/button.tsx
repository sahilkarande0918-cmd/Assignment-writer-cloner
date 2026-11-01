import { cn } from "@/lib/utils";
import Link from "next/link";
import type { ComponentProps } from "react";

const variants = {
  primary: "bg-ink text-ivory hover:bg-ink-2 disabled:bg-line-strong disabled:text-muted",
  secondary: "border border-line-strong bg-paper text-ink hover:border-ink disabled:text-muted disabled:hover:border-line-strong",
  ghost: "text-ink-2 hover:bg-line/60 hover:text-ink disabled:text-muted disabled:hover:bg-transparent",
} as const;
const sizes = { sm: "h-8 px-3 text-sm", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-base" } as const;

type Style = { variant?: keyof typeof variants; size?: keyof typeof sizes };

export function buttonClass({ variant = "primary", size = "md" }: Style = {}, className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors duration-200 disabled:cursor-not-allowed",
    variants[variant],
    sizes[size],
    className,
  );
}

export function Button({ variant, size, className, ...props }: ComponentProps<"button"> & Style) {
  return <button type="button" className={buttonClass({ variant, size }, className)} {...props} />;
}

export function ButtonLink({ variant, size, className, ...props }: ComponentProps<typeof Link> & Style) {
  return <Link className={buttonClass({ variant, size }, className)} {...props} />;
}
