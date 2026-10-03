const files = [
  { label: "Golden invoice", href: "/demo/golden-invoice.txt", detail: "50 paid boxes at the billed rate" },
  { label: "Supplier agreement", href: "/demo/golden-supplier-message.txt", detail: "Agreed rate and 10+1 scheme" },
  { label: "Receiving note", href: "/demo/golden-receiving-note.txt", detail: "Confirm the counts in Receive Stock" },
  { label: "Posted credit note", href: "/demo/golden-full-credit-note.txt", detail: "Use later, after the supplier reply" },
] as const;

export function DemoDownloads() {
  return (
    <section className="border-t border-[#e2e8de] bg-white px-5 py-14 sm:px-8">
      <div className="mx-auto max-w-7xl lg:px-4">
        <p className="text-xs font-bold uppercase tracking-[0.17em] text-[#176b46]">Try it yourself</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Sample evidence for the live demo</h2>
        <p className="mt-2 text-sm leading-6 text-[#627167]">Clearly synthetic files for a repeatable walkthrough. Upload the credit note only after the claim and supplier response.</p>
        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {files.map((file) => (
            <a key={file.href} href={file.href} download className="rounded-xl border border-[#dce6d9] bg-[#f8faf5] p-4 transition-colors hover:border-[#79b786] hover:bg-[#eef6eb]">
              <span className="block text-sm font-semibold text-[#1a4f34]">{file.label} ↗</span>
              <span className="mt-1 block text-xs leading-5 text-[#627167]">{file.detail}</span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
