import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Camera,
  Check,
  FileCheck2,
  PackageCheck,
  ShieldCheck,
} from "lucide-react";
import { DemoDownloads } from "../components/marketing/demo-downloads";

const truths = [
  { number: "01", name: "Promised", value: "50 boxes", detail: "₹428 each · 10+1 free" },
  { number: "02", name: "Billed", value: "50 boxes", detail: "₹441 each" },
  { number: "03", name: "Received", value: "48 paid", detail: "3 free · 2 damaged" },
] as const;

const differences = [
  ["Short delivery", "₹882"],
  ["Rate mismatch", "₹598"],
  ["Missing free units", "₹856"],
  ["Damaged goods", "₹882"],
] as const;

const steps = [
  {
    icon: Camera,
    number: "01",
    title: "Capture what happened.",
    body: "Add the supplier promise, the invoice and what actually arrived. Every fact stays linked to its evidence.",
  },
  {
    icon: FileCheck2,
    number: "02",
    title: "See the exact difference.",
    body: "AI reads the messy inputs. Deterministic checks calculate what is owed in integer paise.",
  },
  {
    icon: PackageCheck,
    number: "03",
    title: "Recover and verify.",
    body: "You approve before a claim goes out. A later credit note or replacement must prove recovery.",
  },
] as const;

function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5 text-xl font-black tracking-[-0.05em]" aria-label="ClaimBack home">
      <span className={light
        ? "flex size-9 items-center justify-center rounded-full bg-[#9fe870] text-[#163300]"
        : "flex size-9 items-center justify-center rounded-full bg-[#163300] text-[#9fe870]"}>
        <ShieldCheck className="size-5" strokeWidth={2.4} aria-hidden="true" />
      </span>
      <span>ClaimBack</span>
    </Link>
  );
}

function LiveDemoLink({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link
      href="/app"
      className={inverse
        ? "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#9fe870] px-6 py-3 text-sm font-bold text-[#163300] transition-colors hover:bg-[#b8f18e]"
        : "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#163300] px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-[#054d28]"}
    >
      Open live demo <ArrowUpRight className="size-4" aria-hidden="true" />
    </Link>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen overflow-x-clip bg-white text-[#163300]">
      <header className="sticky top-0 z-50 border-b border-[#e8ebe6] bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex min-h-18 max-w-[1200px] items-center justify-between gap-4 px-5 sm:px-8">
          <Brand />
          <nav aria-label="Main navigation" className="hidden items-center gap-1 rounded-full bg-[#e8ebe6] p-1 md:flex">
            <a href="#how-it-works" className="rounded-full px-4 py-2 text-sm font-semibold transition-colors hover:bg-white">How it works</a>
            <a href="#verified-recovery" className="rounded-full px-4 py-2 text-sm font-semibold transition-colors hover:bg-white">Verified recovery</a>
            <a href="#demo-kit" className="rounded-full px-4 py-2 text-sm font-semibold transition-colors hover:bg-white">Demo kit</a>
          </nav>
          <div className="flex items-center gap-4">
            <Link href="/login" className="hidden text-sm font-semibold hover:underline sm:inline">Log in</Link>
            <Link href="/app" className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-[#163300] px-4 py-2 text-xs font-bold transition-colors hover:bg-[#e2f6d5] sm:text-sm">
              <span className="sm:hidden">Demo</span><span className="hidden sm:inline">Open demo</span><ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1200px] px-5 pb-20 pt-18 text-center sm:px-8 sm:pb-28 sm:pt-24 lg:pt-28">
        <p className="mx-auto inline-flex items-center gap-2 rounded-full bg-[#e2f6d5] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.15em] text-[#163300] sm:text-xs">
          <span className="size-2 rounded-full bg-[#054d28]" aria-hidden="true" />
          AI margin protector for merchants
        </p>
        <h1 className="mx-auto mt-8 max-w-[12ch] text-[clamp(3.1rem,8.6vw,8rem)] font-black uppercase leading-[0.86] tracking-[-0.075em] text-[#0e0f0c]">
          Stop losing<br /><span className="text-[#163300]">margin.</span>
        </h1>
        <p className="mt-7 text-xl font-bold tracking-[-0.03em] text-[#163300] sm:text-2xl">Before stock hits the shelf.</p>
        <p className="mx-auto mt-5 max-w-[43rem] text-base leading-7 text-[#454745] sm:text-lg sm:leading-8">
          ClaimBack compares what suppliers promised, what they billed and what arrived. Then it follows every claim until the money or stock actually comes back.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <LiveDemoLink />
          <a href="#how-it-works" className="inline-flex min-h-12 items-center gap-2 px-2 text-sm font-bold underline decoration-[#163300]/40 underline-offset-4 hover:decoration-[#163300]">
            See how it works <ArrowDown className="size-4" aria-hidden="true" />
          </a>
        </div>
        <p className="mt-7 text-xs text-[#6a6c6a]">Your approval comes before a supplier-facing claim.</p>
      </section>

      <section aria-labelledby="three-truths-title" className="bg-[#163300] px-5 py-18 text-white sm:px-8 lg:py-24">
        <div className="mx-auto max-w-[1200px]">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.17em] text-[#9fe870]">One delivery. Three truths.</p>
              <h2 id="three-truths-title" className="mt-4 max-w-[12ch] text-[clamp(2.8rem,5.5vw,5.5rem)] font-black leading-[0.95] tracking-[-0.065em]">
                Know where the margin went.
              </h2>
            </div>
            <p className="max-w-xs text-sm leading-6 text-white/75">A source-linked example from the synthetic files included with the live demo.</p>
          </div>
          <div className="mt-11 grid gap-3 md:grid-cols-3">
            {truths.map((truth) => (
              <article key={truth.name} className="min-h-48 rounded-[10px] bg-white p-6 text-[#163300]">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-black uppercase tracking-[0.16em]">{truth.name}</p>
                  <span className="font-mono text-xs text-[#555a55]">{truth.number}</span>
                </div>
                <p className="mt-9 text-4xl font-black tracking-[-0.06em] sm:text-5xl">{truth.value}</p>
                <p className="mt-2 text-sm text-[#454745]">{truth.detail}</p>
              </article>
            ))}
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto]">
            <div className="rounded-[10px] bg-[#054d28] p-6 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#b5e59b]">Grounded differences</p>
                <span className="rounded-full border border-white/30 px-3 py-1 text-xs font-semibold">4 found</span>
              </div>
              <div className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
                {differences.map(([name, amount]) => (
                  <div key={name} className="flex items-center justify-between gap-4 border-b border-white/20 pb-2 text-sm">
                    <span className="text-white/80">{name}</span>
                    <strong className="font-mono text-white">{amount}</strong>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex min-w-0 flex-col justify-between rounded-[10px] bg-[#9fe870] p-6 text-[#163300] sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.16em]">Potential recovery</p>
              <p className="mt-8 font-mono text-[clamp(2.6rem,5vw,4.5rem)] font-bold leading-none tracking-[-0.08em]">₹3,218</p>
              <p className="mt-3 text-xs leading-5">Calculated from this synthetic delivery. Recovery is verified later.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-24 bg-white px-5 py-20 sm:px-8 lg:py-30">
        <div className="mx-auto max-w-[1200px]">
          <p className="text-xs font-bold uppercase tracking-[0.17em] text-[#054d28]">How ClaimBack works</p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
            <h2 className="max-w-[14ch] text-[clamp(2.8rem,5.6vw,5.75rem)] font-black leading-[0.95] tracking-[-0.065em] text-[#0e0f0c]">Messy deliveries.<br />Clear answers.</h2>
            <p className="max-w-sm text-base leading-7 text-[#6a6c6a]">From the first invoice to the final verified credit, every step has a purpose.</p>
          </div>
          <div className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
            {steps.map((step) => (
              <article key={step.title} className="border-t border-[#163300] pt-6">
                <div className="flex items-start justify-between">
                  <step.icon className="size-7 text-[#163300]" strokeWidth={1.8} aria-hidden="true" />
                  <span className="font-mono text-sm text-[#555a55]">{step.number}</span>
                </div>
                <h3 className="mt-8 max-w-[13ch] text-2xl font-bold leading-tight tracking-[-0.035em] text-[#0e0f0c]">{step.title}</h3>
                <p className="mt-3 max-w-sm text-sm leading-7 text-[#6a6c6a]">{step.body}</p>
              </article>
            ))}
          </div>
          <p className="mt-13 inline-flex items-center gap-2 rounded-full bg-[#e2f6d5] px-4 py-2 text-xs font-semibold text-[#163300]">
            <Check className="size-4" aria-hidden="true" />
            Clean delivery? No claim required.
          </p>
        </div>
      </section>

      <section id="verified-recovery" className="scroll-mt-24 bg-[#e2f6d5] px-5 py-20 sm:px-8 lg:py-28">
        <div className="mx-auto grid max-w-[1200px] items-center gap-12 lg:grid-cols-[1fr_0.9fr] lg:gap-20">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.17em] text-[#054d28]">The part most tools forget</p>
            <h2 className="mt-4 max-w-[11ch] text-[clamp(2.8rem,5.5vw,5.5rem)] font-black leading-[0.95] tracking-[-0.065em] text-[#0e0f0c]">
              A promise is not payment.
            </h2>
            <p className="mt-7 max-w-xl text-base leading-8 text-[#454745] sm:text-lg">
              “Next invoice mein adjust kar denge” leaves money outstanding. ClaimBack keeps the case open until a later invoice, credit note or replacement proves the recovery.
            </p>
            <Link href="/app" className="mt-7 inline-flex items-center gap-2 text-sm font-bold underline underline-offset-4">
              Follow a live case <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="rounded-[28px] bg-white p-6 text-[#163300] shadow-[0_16px_48px_rgba(22,51,0,0.08)] sm:p-8">
            <div className="flex items-center justify-between gap-3 border-b border-[#e8ebe6] pb-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#6a6c6a]">Recovery memory</p>
                <p className="mt-1 text-lg font-bold">Invoice INV-3812</p>
              </div>
              <span className="rounded-full bg-[#e2f6d5] px-3 py-1 text-xs font-bold">Synthetic case</span>
            </div>
            <ol className="mt-6 space-y-5">
              {[
                ["Claim approved", "Merchant authorizes the supplier message."],
                ["Credit promised", "₹3,218 remains outstanding."],
                ["Later evidence checked", "Posted credit note matches the claim."],
                ["Recovery verified", "₹3,218 recovered · case closed."],
              ].map(([title, detail], index) => (
                <li key={title} className="flex gap-4">
                  <span className={index === 3
                    ? "flex size-8 shrink-0 items-center justify-center rounded-full bg-[#163300] text-[#9fe870]"
                    : "flex size-8 shrink-0 items-center justify-center rounded-full bg-[#e2f6d5] text-[#163300]"}>
                    <Check className="size-4" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-bold">{title}</p>
                    <p className="mt-1 text-sm leading-6 text-[#6a6c6a]">{detail}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-7 rounded-[10px] bg-[#e8ebe6] p-3 text-xs leading-5 text-[#555a55]">
              Illustrative completed path using synthetic evidence. The live product verifies posted recovery before closing.
            </p>
          </div>
        </div>
      </section>

      <DemoDownloads />

      <footer className="bg-[#163300] px-5 pb-10 pt-20 text-white sm:px-8 lg:pt-24">
        <div className="mx-auto max-w-[1200px]">
          <p className="text-xs font-bold uppercase tracking-[0.17em] text-[#9fe870]">Keep what you earned</p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-8 border-b border-white/25 pb-16">
            <h2 className="max-w-[12ch] text-[clamp(3rem,6vw,6rem)] font-black uppercase leading-[0.9] tracking-[-0.07em] text-[#9fe870]">Your margin.<br />Protected.</h2>
            <LiveDemoLink inverse />
          </div>
          <div className="flex flex-wrap items-start justify-between gap-6 py-8">
            <Brand light />
            <p className="max-w-md text-xs leading-6 text-white/65">
              Standalone hackathon prototype. Paytm for Business and Soundbox-like reminders are future distribution ideas, not active integrations.
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
