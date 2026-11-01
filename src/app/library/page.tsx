import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Library" };

export default function LibraryPage() {
  return (
    <>
      <SiteHeader current="library" />
      <main id="main" className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-14 sm:px-8 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-6 border-b border-line pb-8">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.28em] text-bronze-ink">My library</p>
            <h1 className="mt-4 font-display text-[clamp(2.6rem,6vw,5rem)] leading-none tracking-tight">Saved assignments</h1>
          </div>
          <ButtonLink href="/studio">New project</ButtonLink>
        </div>
        <div className="grid min-h-[40vh] place-items-center py-16 text-center">
          <div className="max-w-md">
            <Badge tone="pending">Saving not built yet</Badge>
            <p className="mt-5 font-display text-3xl">No saved projects yet.</p>
            <p className="mt-3 text-ink-2">
              Projects will keep their source, reference, edit history, snapshots and outputs. At least ten complete projects are supported, and saved projects never expire
              automatically.
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
