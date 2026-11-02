import { SiteHeader } from "@/components/site-header";
import { ButtonLink } from "@/components/ui/button";
import { HeroBackdrop } from "@/components/landing/hero-backdrop";
import { BeforeAfter } from "@/components/landing/before-after";
import { Reveal } from "@/components/landing/reveal";

const MODES = [
  {
    n: "01",
    title: "Edit Assignment",
    body: "Upload a handwritten or digital assignment, describe the change in plain words, review the operation plan, then apply. Names, PRNs, paragraphs, tables — the rest of the page stays put.",
  },
  {
    n: "02",
    title: "Handwriting Clone",
    body: "Learn a writing style from your own authorised reference pages and compose entirely new content on a reconstructed notebook sheet — margins, ruling and pen colour included.",
  },
  {
    n: "03",
    title: "Convert Handwriting",
    body: "Keep the content of one assignment and rewrite it in the handwriting of another. The text is transcribed, checked by you, then written in the second assignment's style — its words are never borrowed.",
  },
  {
    n: "04",
    title: "Digital Document Studio",
    body: "Edit machine-typed PDFs and DOCX files while keeping fonts, tables, headers and geometry wherever the file allows. Substitutions are flagged, never hidden.",
  },
  {
    n: "05",
    title: "My Library",
    body: "Every project keeps its source, reference, edit history, snapshots and outputs. Rename, duplicate, search and reopen — nothing silently expires.",
  },
  {
    n: "06",
    title: "Output",
    body: "Print-ready PDF in A4 or Letter, per-page PNG or JPEG at the DPI you choose, DOCX where it is meaningful, and plain text or Markdown extraction.",
  },
];

const LIMITS = [
  ["Similarity, not identity", "Generated handwriting approximates a style. It is previewed with confidence notes and can be corrected line by line — it is never claimed to be identical."],
  ["Digital vs scanned", "Native PDF and DOCX text can often be edited in place. Scans and photos are reconstructed region by region and are never lossless."],
  ["Your own references", "Use handwriting you are authorised to use. Signatures and identity documents are out of scope, and generated pages carry a provenance flag."],
  ["Honest status", "Handwriting is generated on a cloud GPU that starts when you press Generate, with a live progress bar. Free accounts get 3 generations."],
];

const STEPS = [
  "Upload the original and, optionally, a handwriting reference.",
  "Describe the change. A strict, reviewable plan comes back — never code.",
  "Preview the diff, apply, undo if needed, and export.",
];

const eyebrow = "text-xs font-medium uppercase tracking-[0.28em] text-bronze-ink";
const h2 = "font-display text-[clamp(2.4rem,5vw,4.5rem)] leading-[0.98] tracking-tight";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">
        <section className="relative isolate overflow-hidden border-b border-line">
          <HeroBackdrop />
          <div className="relative mx-auto flex min-h-[calc(100svh-4rem)] max-w-[1440px] flex-col justify-end px-4 pb-16 pt-24 sm:px-8 sm:pb-24">
            <p className={`rise mb-6 ${eyebrow}`}>Private assignment studio</p>
            <h1 className="rise max-w-[14ch] font-display text-[clamp(3.2rem,9vw,8.5rem)] leading-[0.92] tracking-[-0.02em] [animation-delay:80ms]">
              Every page, <em className="text-bronze-ink">rewritten</em> with care.
            </h1>
            <p className="rise mt-8 max-w-xl text-lg leading-relaxed text-ink-2 [animation-delay:160ms]">
              Edit assignments without disturbing the page around them, keep digital fonts intact, and compose new notebook pages in a
              handwriting style learned from your own references.
            </p>
            <div className="rise mt-10 flex flex-wrap gap-3 [animation-delay:240ms]">
              <ButtonLink href="/studio" size="lg">
                Open the studio
              </ButtonLink>
              <ButtonLink href="/library" size="lg" variant="secondary">
                View library
              </ButtonLink>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-[1440px] items-center gap-16 px-4 py-24 sm:px-8 lg:grid-cols-[1fr_1.1fr] lg:py-36">
          <Reveal>
            <p className={eyebrow}>The workflow</p>
            <h2 className={`mt-5 ${h2}`}>
              Change one line. <br />
              Leave the page alone.
            </h2>
            <ol className="mt-10 divide-y divide-line border-y border-line">
              {STEPS.map((s, i) => (
                <li key={s} className="flex gap-6 py-5 text-ink-2">
                  <span className="font-mono text-sm text-muted">0{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
          </Reveal>
          <Reveal delay={0.1}>
            <BeforeAfter />
          </Reveal>
        </section>

        <section className="border-t border-line bg-paper">
          <div className="mx-auto max-w-[1440px] px-4 py-24 sm:px-8 lg:py-32">
            <Reveal>
              <h2 className={`max-w-[18ch] ${h2}`}>Six rooms, one quiet studio.</h2>
            </Reveal>
            <div className="mt-16 grid gap-px border-y border-line bg-line md:grid-cols-2 lg:grid-cols-3">
              {MODES.map((m, i) => (
                <Reveal key={m.n} delay={(i % 3) * 0.06} className="bg-paper py-10 md:px-8">
                  <span className="font-mono text-sm text-muted">{m.n}</span>
                  <h3 className="mt-6 font-display text-3xl">{m.title}</h3>
                  <p className="mt-4 leading-relaxed text-ink-2">{m.body}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1440px] px-4 py-24 sm:px-8 lg:py-32">
          <Reveal>
            <p className={eyebrow}>Plainly stated</p>
            <h2 className={`mt-5 max-w-[20ch] ${h2}`}>What it does, and what it won&apos;t pretend to.</h2>
          </Reveal>
          <dl className="mt-16 grid gap-x-12 gap-y-10 md:grid-cols-2">
            {LIMITS.map(([t, d], i) => (
              <Reveal key={t} delay={(i % 2) * 0.06} className="border-t border-ink pt-6">
                <dt className="text-lg font-medium">{t}</dt>
                <dd className="mt-3 leading-relaxed text-ink-2">{d}</dd>
              </Reveal>
            ))}
          </dl>
        </section>

        <section className="border-t border-line bg-ink text-ivory">
          <div className="mx-auto flex max-w-[1440px] flex-col items-start gap-10 px-4 py-24 sm:px-8 lg:flex-row lg:items-end lg:justify-between">
            <h2 className={`max-w-[16ch] ${h2}`}>Start with the page you already have.</h2>
            <ButtonLink href="/studio" size="lg" className="bg-ivory text-ink hover:bg-line">
              Open the studio
            </ButtonLink>
          </div>
        </section>
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1440px] flex-wrap justify-between gap-4 px-4 py-8 text-sm text-muted sm:px-8">
          <span>Assignment Studio — private use.</span>
          <span>Generated handwriting is an approximation and is marked as generated.</span>
        </div>
      </footer>
    </>
  );
}
