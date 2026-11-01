import type { Metadata } from "next";
import { Suspense } from "react";
import { Studio } from "@/components/studio/studio";

export const metadata: Metadata = { title: "Studio" };

export default function StudioPage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-muted">Opening the studio…</p>}>
      <Studio />
    </Suspense>
  );
}
