import Link from "next/link";
import { ArrowUpRight, Check, ShieldCheck } from "lucide-react";

export function AuthFrame({
  children,
  eyebrow,
  title,
  description,
}: {
  children: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(400px,0.85fr)]">
      <section className="flex min-h-screen flex-col px-5 py-6 sm:px-10 lg:px-16 lg:py-10">
        <Link href="/" className="inline-flex w-fit items-center gap-2 text-xl font-bold tracking-tight">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-white">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </span>
          ClaimBack
        </Link>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-primary">{eyebrow}</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-3 text-sm leading-6 text-muted sm:text-base">{description}</p>
          {children}
        </div>

        <p className="text-xs text-muted">© {new Date().getFullYear()} ClaimBack · Built for merchants who protect every rupee.</p>
      </section>

      <aside className="relative hidden overflow-hidden bg-[#123b2b] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-32 -top-32 size-[430px] rounded-full border border-white/10" aria-hidden="true" />
        <div className="absolute -right-16 -top-16 size-[300px] rounded-full border border-white/10" aria-hidden="true" />
        <div className="relative inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-medium text-[#d8eddd]">
          <span className="size-1.5 rounded-full bg-[#a8e3b8]" />
          AI margin protection
        </div>
        <div className="relative max-w-xl">
          <div className="mb-8 grid gap-3 rounded-2xl border border-white/10 bg-white/10 p-5 backdrop-blur-sm">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.14em] text-[#c7decf]">
              <span>Three truths, one clear answer</span>
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </div>
            {[
              ["Promised", "What your supplier agreed"],
              ["Billed", "What the invoice charged"],
              ["Received", "What actually arrived"],
            ].map(([label, copy]) => (
              <div key={label} className="flex items-center gap-3 rounded-xl bg-white/10 px-4 py-3">
                <Check className="size-4 text-[#a8e3b8]" aria-hidden="true" />
                <span className="w-20 text-sm font-semibold">{label}</span>
                <span className="text-sm text-[#c7decf]">{copy}</span>
              </div>
            ))}
          </div>
          <p className="text-3xl font-semibold leading-tight tracking-tight">Every delivery deserves a second look. Every promised credit deserves a follow-up.</p>
        </div>
        <p className="relative text-sm text-[#b9d7c4]">Detect → claim → verify → recover</p>
      </aside>
    </main>
  );
}
