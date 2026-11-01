import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";

export function SiteHeader({ current }: { current?: "studio" | "library" }) {
  const link = (href: string, label: string, key: string) => (
    <Link
      href={href}
      aria-current={current === key ? "page" : undefined}
      className="text-sm text-ink-2 transition-colors hover:text-ink aria-[current=page]:text-ink aria-[current=page]:underline aria-[current=page]:underline-offset-8"
    >
      {label}
    </Link>
  );
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-ivory/90 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-8">
        <Link href="/" className="font-display text-2xl leading-none tracking-tight">
          Assignment Studio
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-5 sm:gap-8">
          {link("/studio", "Studio", "studio")}
          {link("/library", "Library", "library")}
          <ButtonLink href="/studio" size="sm" className="hidden sm:inline-flex">
            New project
          </ButtonLink>
        </nav>
      </div>
    </header>
  );
}
