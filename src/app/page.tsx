import Link from "next/link";
import { ArrowRight, ArrowUpRight, Camera, Check, FileCheck2, PackageCheck, ShieldCheck } from "lucide-react";
import { DemoDownloads } from "../components/marketing/demo-downloads";

const truths = [
  { name: "Promised", value: "50 boxes · ₹428 · 10+1", tone: "bg-[#e8f4e8] text-[#215d3f]" },
  { name: "Billed", value: "50 boxes · ₹441", tone: "bg-[#f4f0e5] text-[#695a31]" },
  { name: "Received", value: "48 paid · 3 free · 2 damaged", tone: "bg-[#f7ece7] text-[#82523e]" },
];
const differences = [
  ["Short delivery", "₹882"],
  ["Rate mismatch", "₹598"],
  ["Missing free units", "₹856"],
  ["Damaged goods", "₹882"],
];
const steps = [
  { icon: Camera, title: "Capture the three truths", body: "Add the supplier promise, invoice and what actually arrived. Each fact stays attached to its source." },
  { icon: FileCheck2, title: "See the exact difference", body: "AI reads messy evidence. Deterministic checks calculate the recovery amount in paise." },
  { icon: PackageCheck, title: "Recover, then verify", body: "Approve before a claim is sent. Later evidence must prove a promised credit arrived." },
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f8f8f3] text-[#18251f]">
      <div className="bg-[#163e2d] text-white">
        <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8 lg:px-12">
          <Link href="/" className="inline-flex items-center gap-2.5 text-xl font-bold tracking-tight" aria-label="ClaimBack home"><span className="flex size-9 items-center justify-center rounded-xl bg-[#c9e98d] text-[#173b29]"><ShieldCheck className="size-5" aria-hidden="true" /></span>ClaimBack</Link>
          <nav className="hidden items-center gap-8 text-sm text-white/75 md:flex" aria-label="Main navigation"><a href="#how-it-works" className="hover:text-white">How it works</a><a href="#verified-recovery" className="hover:text-white">Verified recovery</a></nav>
          <Link href="/app" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/30 px-4 py-2 text-sm font-semibold hover:bg-white hover:text-[#163e2d]">Open live demo <ArrowUpRight className="size-4" aria-hidden="true" /></Link>
        </header>
        <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-14 sm:px-8 sm:pt-20 lg:grid-cols-2 lg:gap-16 lg:px-12 lg:pb-28 lg:pt-28">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#8bc68e]/40 bg-[#2a5841] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.17em] text-[#c9e98d]"><span className="size-1.5 rounded-full bg-[#c9e98d]" />AI margin protector for merchants</span>
            <h1 className="mt-7 max-w-[12ch] text-[clamp(3.4rem,7vw,6.5rem)] font-semibold leading-[0.99] tracking-[-0.065em]">Stop losing margin <span className="text-[#c9e98d]">before stock hits the shelf.</span></h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-[#d4e3d8]">ClaimBack reads supplier promises, invoices and deliveries, catches leakage, and follows every claim until the money or stock actually comes back.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row"><Link href="/app" className="inline-flex min-h-13 items-center justify-center gap-2 rounded-xl bg-[#c9e98d] px-6 py-3 font-semibold text-[#183d2b] hover:bg-[#d8f4aa]">Open live demo <ArrowRight className="size-5" aria-hidden="true" /></Link><a href="#how-it-works" className="inline-flex min-h-13 items-center justify-center rounded-xl border border-white/30 px-6 py-3 font-semibold hover:bg-white/10">See how it works</a></div>
            <p className="mt-5 flex items-center gap-2 text-sm text-[#bfd3c3]"><Check className="size-4 text-[#c9e98d]" aria-hidden="true" />Evidence linked to every claim. You approve before sending.</p>
          </div>
          <div className="min-w-0 rounded-[1.7rem] border border-white/20 bg-[#f9faf5] p-3 text-[#1b2921] shadow-[0_32px_90px_rgba(3,24,13,0.28)] sm:p-5">
            <div className="flex items-center justify-between gap-3 border-b border-[#e1e7dd] px-2 pb-4 pt-1 sm:px-3"><div><p className="text-xs font-bold uppercase tracking-[0.15em] text-[#54705b]">Receiving review</p><p className="mt-1 text-sm font-semibold">Invoice INV-3812</p></div><span className="rounded-full bg-[#e8f4e8] px-3 py-1.5 text-xs font-semibold text-[#236946]">Synthetic demo</span></div>
            <div className="grid gap-2 py-4 sm:grid-cols-3">{truths.map((truth) => <div key={truth.name} className={`min-w-0 rounded-xl p-3.5 ${truth.tone}`}><p className="text-[11px] font-bold uppercase tracking-[0.12em]">{truth.name}</p><p className="mt-2 text-sm font-semibold leading-5">{truth.value}</p></div>)}</div>
            <div className="rounded-2xl border border-[#e2e8dd] bg-white p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">Grounded differences</p><span className="text-xs text-[#64806c]">4 found</span></div><div className="mt-3 divide-y divide-[#edf0ea]">{differences.map(([label, amount]) => <div key={label} className="flex justify-between gap-4 py-2.5 text-sm"><span className="text-[#56675a]">{label}</span><strong className="font-mono tabular-nums">{amount}</strong></div>)}</div><div className="mt-2 flex items-baseline justify-between gap-4 rounded-xl bg-[#e8f4e8] px-4 py-3"><span className="text-sm font-semibold text-[#245b3e]">Potential recovery</span><strong className="font-mono text-2xl tabular-nums text-[#176b46]">₹3,218</strong></div><p className="mt-3 text-xs leading-5 text-[#6c796f]">Illustrative result from included synthetic evidence. Recovery requires later proof.</p></div>
          </div>
        </section>
      </div>
      <DemoDownloads />
      <section className="border-b border-[#e2e8de] bg-[#eff3eb]"><div className="mx-auto grid max-w-7xl gap-5 px-5 py-7 text-sm font-medium text-[#41624a] sm:grid-cols-3 sm:px-8 lg:px-12">{["Every amount linked to evidence", "No claim without your approval", "No case closed on a promise"].map((item) => <p key={item} className="flex items-center gap-2"><Check className="size-4 shrink-0 text-[#176b46]" aria-hidden="true" />{item}</p>)}</div></section>
      <section id="how-it-works" className="mx-auto max-w-7xl scroll-mt-8 px-5 py-20 sm:px-8 lg:px-12 lg:py-28"><div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.17em] text-[#176b46]">How ClaimBack works</p><h2 className="mt-3 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">From messy evidence to money back.</h2><p className="mt-4 text-lg leading-8 text-[#627167]">One clear workflow for the stock that was promised, billed and delivered.</p></div><div className="mt-10 grid gap-4 md:grid-cols-3">{steps.map((step, index) => <article key={step.title} className="rounded-2xl border border-[#e0e7dc] bg-white p-6 shadow-[0_7px_28px_rgba(30,59,35,0.04)]"><div className="flex items-center justify-between"><span className="flex size-12 items-center justify-center rounded-xl bg-[#eaf3e8] text-[#176b46]"><step.icon className="size-6" aria-hidden="true" /></span><span className="font-mono text-sm text-[#839389]">0{index + 1}</span></div><h3 className="mt-8 text-xl font-semibold tracking-tight">{step.title}</h3><p className="mt-3 text-sm leading-7 text-[#627167]">{step.body}</p></article>)}</div></section>
      <section id="verified-recovery" className="scroll-mt-8 bg-[#eaf0e5] px-5 py-20 sm:px-8 lg:py-28"><div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-2 lg:gap-20 lg:px-4"><div><p className="text-xs font-bold uppercase tracking-[0.17em] text-[#176b46]">The part most tools forget</p><h2 className="mt-3 max-w-xl text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">A promise to credit you is not recovery.</h2><p className="mt-5 max-w-lg text-lg leading-8 text-[#566b5b]">When a supplier says “we&apos;ll adjust it next invoice,” ClaimBack keeps the amount open. The case resolves only when a later invoice, credit note or replacement proves it arrived.</p><Link href="/app" className="mt-7 inline-flex items-center gap-2 font-semibold text-[#176b46] hover:underline">See the live workflow <ArrowRight className="size-4" aria-hidden="true" /></Link></div><div className="rounded-[1.5rem] border border-[#d6e2d3] bg-white p-5 shadow-[0_18px_55px_rgba(25,61,36,0.07)] sm:p-8"><p className="text-xs font-bold uppercase tracking-[0.15em] text-[#627167]">Recovery timeline</p><ol className="mt-6 space-y-5">{[["Claim approved and sent", "Merchant decision recorded"], ["Supplier promises a later credit", "₹3,218 still outstanding"], ["New evidence checked", "Posted credit note matched to claim"], ["Recovery verified", "₹3,218 recovered · case closed"]].map(([title, detail], index) => <li key={title} className="flex gap-4"><span className={`flex size-7 shrink-0 items-center justify-center rounded-full ${index === 3 ? "bg-[#176b46] text-white" : "bg-[#e9f4e9] text-[#176b46]"}`}><Check className="size-4" aria-hidden="true" /></span><div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-sm text-[#627167]">{detail}</p></div></li>)}</ol><p className="mt-6 rounded-lg bg-[#eff6ec] p-3 text-xs leading-5 text-[#54705b]">Illustrative completed path using synthetic evidence; the live product verifies posted recovery before closing.</p></div></div></section>
      <footer className="bg-[#163e2d] px-5 py-12 text-white sm:px-8"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 lg:flex-row lg:items-end lg:px-4"><div><p className="text-2xl font-semibold tracking-tight">ClaimBack</p><p className="mt-2 text-sm text-[#c5d7ca]">Protect the margin you have already earned.</p><p className="mt-4 max-w-lg text-xs leading-5 text-[#a6c3ae]">Standalone hackathon prototype. Paytm for Business and Soundbox-like reminders are future distribution ideas, not active integrations.</p></div><Link href="/app" className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#c9e98d] px-5 py-3 font-semibold text-[#183d2b] hover:bg-[#d8f4aa]">Open live demo <ArrowUpRight className="size-4" aria-hidden="true" /></Link></div></footer>
    </main>
  );
}
