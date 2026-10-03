export default function AppLoading() {
  return (
    <div role="status" aria-label="Loading your workspace" className="mx-auto max-w-5xl space-y-5 px-5 py-10 sm:px-8">
      <div className="h-7 w-56 animate-pulse rounded-lg bg-border" />
      <div className="h-4 w-80 max-w-full animate-pulse rounded-lg bg-border/70" />
      <div className="grid gap-4 pt-4 sm:grid-cols-3">
        {[0, 1, 2].map((item) => <div key={item} className="h-36 animate-pulse rounded-2xl border border-border bg-surface" />)}
      </div>
      <span className="sr-only">Loading your workspace</span>
    </div>
  );
}
