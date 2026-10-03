export default function SuppliersLoading() {
  return (
    <div role="status" aria-label="Loading supplier history" className="space-y-6 animate-pulse">
      <div className="space-y-3">
        <div className="h-3 w-32 rounded bg-border" />
        <div className="h-9 w-80 max-w-full rounded-lg bg-border" />
        <div className="h-4 w-full max-w-xl rounded bg-border/70" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1].map((index) => <div key={index} className="h-36 rounded-2xl border border-border bg-surface" />)}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        {[0, 1].map((index) => <div key={index} className="h-72 rounded-2xl border border-border bg-surface" />)}
      </div>
      <span className="sr-only">Loading supplier history</span>
    </div>
  );
}
