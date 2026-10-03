import { ArrowDownToLine } from "lucide-react";

const files = [
  { label: "Golden invoice", href: "/demo/golden-invoice.txt", detail: "50 paid boxes at the billed rate" },
  { label: "Supplier agreement", href: "/demo/golden-supplier-message.txt", detail: "Agreed rate and 10+1 scheme" },
  { label: "Receiving note", href: "/demo/golden-receiving-note.txt", detail: "Confirm the counts in Receive Stock" },
  { label: "Posted credit note", href: "/demo/golden-full-credit-note.txt", detail: "Use later, after the supplier reply" },
] as const;

export function DemoDownloads() {
  return (
    <section id="demo-kit" className="scroll-mt-24 bg-white px-5 py-20 text-[#163300] sm:px-8 lg:py-28">
      <div className="mx-auto max-w-[1200px]">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.17em] text-[#054d28]">Try it yourself</p>
            <h2 className="mt-4 max-w-[14ch] text-[clamp(2.8rem,5.5vw,5.5rem)] font-black leading-[0.95] tracking-[-0.065em] text-[#0e0f0c]">
              Proof you can open.
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-7 text-[#6a6c6a]">
            Download clearly synthetic evidence for a repeatable walkthrough. Upload the credit note only after the claim and supplier response.
          </p>
        </div>
        <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {files.map((file, index) => (
            <a
              key={file.href}
              href={file.href}
              download
              className="group flex min-h-48 flex-col justify-between rounded-[10px] bg-[#e8ebe6] p-5 transition-colors hover:bg-[#e2f6d5]"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="font-mono text-xs text-[#555a55]">0{index + 1}</span>
                <span className="flex size-9 items-center justify-center rounded-full border border-[#163300] transition-colors group-hover:bg-[#163300] group-hover:text-[#9fe870]">
                  <ArrowDownToLine className="size-4" aria-hidden="true" />
                </span>
              </div>
              <div>
                <span className="block text-lg font-bold tracking-[-0.03em]">{file.label}</span>
                <span className="mt-1 block text-xs leading-5 text-[#555a55]">{file.detail}</span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
