"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, Boxes, ChartNoAxesCombined, CircleHelp, ClipboardList, LogOut, Menu, ShieldCheck, Truck, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/utils";

const navigation = [
  { href: "/app", label: "Overview", icon: ChartNoAxesCombined },
  { href: "/app/receive", label: "Receive Stock", icon: Boxes },
  { href: "/app/cases", label: "Claims", icon: ClipboardList },
  { href: "/app/suppliers", label: "Suppliers", icon: Truck },
] as const;

export function AppShell({ children, businessName, email }: { children: ReactNode; businessName: string; email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  async function signOut() {
    setSigningOut(true);
    setSignOutError(null);
    try {
      const { error } = await createClient().auth.signOut();
      if (error) throw error;
      router.replace("/login");
      router.refresh();
    } catch {
      setSignOutError("Could not sign out. Please try again.");
      setSigningOut(false);
    }
  }

  const navLinks = navigation.map(({ href, label, icon: Icon }) => {
    const active = href === "/app" ? pathname === href : pathname.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        onClick={() => setMobileOpen(false)}
        className={cn(
          "flex min-h-11 items-center gap-3 rounded-lg px-3.5 text-sm font-medium transition-colors",
          active ? "bg-success-soft text-primary" : "text-muted hover:bg-surface-soft hover:text-foreground",
        )}
      >
        <Icon className="size-[18px]" aria-hidden="true" />
        {label}
      </Link>
    );
  });

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="hidden min-h-screen border-r border-border bg-surface lg:flex lg:flex-col lg:px-4 lg:py-5">
        <Link href="/app" className="flex items-center gap-2 px-3 py-2 text-lg font-bold tracking-tight">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-white"><ShieldCheck className="size-5" aria-hidden="true" /></span>
          ClaimBack
        </Link>
        <div className="mt-9 px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-muted">Workspace</div>
        <nav aria-label="Main navigation" className="mt-3 space-y-1">{navLinks}</nav>
        <div className="mt-auto space-y-3">
          <div className="rounded-xl border border-border bg-surface-soft p-4">
            <CircleHelp className="size-5 text-primary" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold">Keep every rupee in view.</p>
            <p className="mt-1 text-xs leading-5 text-muted">Compare deliveries, follow claims, and verify recovery.</p>
            <Link href="/app/receive" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">Receive stock <ArrowRight className="size-3.5" aria-hidden="true" /></Link>
          </div>
          <div className="rounded-xl border border-border px-3 py-3">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success-soft text-sm font-bold text-primary">{businessName.charAt(0).toUpperCase()}</span>
              <div className="min-w-0"><p className="truncate text-sm font-semibold">{businessName}</p><p className="truncate text-xs text-muted">{email}</p></div>
            </div>
            <button type="button" onClick={signOut} disabled={signingOut} className="mt-3 flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-xs font-medium text-muted hover:bg-surface-soft hover:text-foreground disabled:opacity-50"><LogOut className="size-4" aria-hidden="true" />{signingOut ? "Signing out…" : "Sign out"}</button>
            {signOutError && <p role="alert" className="mt-2 text-xs text-danger">{signOutError}</p>}
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-surface/95 px-4 backdrop-blur-sm sm:px-7 lg:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" aria-label="Open navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)} className="flex size-10 items-center justify-center rounded-lg text-foreground hover:bg-surface-soft lg:hidden"><Menu className="size-5" aria-hidden="true" /></button>
            <div className="min-w-0"><p className="truncate text-sm font-semibold">{businessName}</p><p className="text-xs text-muted">Margin protection workspace</p></div>
          </div>
          <Button asChild size="sm" className="hidden sm:inline-flex"><Link href="/app/receive"><Boxes aria-hidden="true" />Receive Stock</Link></Button>
        </header>
        <main id="main-content" className="mx-auto w-full max-w-[1320px] px-4 pb-24 pt-7 sm:px-7 lg:px-10 lg:pb-12 lg:pt-9">{children}</main>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-foreground/45" onClick={() => setMobileOpen(false)} />
          <aside className="relative flex h-full w-[min(84vw,320px)] flex-col bg-surface p-5 shadow-2xl" aria-label="Mobile navigation">
            <div className="flex items-center justify-between"><span className="text-lg font-bold">ClaimBack</span><button type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)} className="flex size-10 items-center justify-center rounded-lg hover:bg-surface-soft"><X className="size-5" aria-hidden="true" /></button></div>
            <nav aria-label="Mobile main navigation" className="mt-8 space-y-1">{navLinks}</nav>
            <div className="mt-auto border-t border-border pt-4"><p className="truncate text-sm font-semibold">{businessName}</p><p className="truncate text-xs text-muted">{email}</p><button type="button" onClick={signOut} disabled={signingOut} className="mt-4 flex min-h-11 items-center gap-2 text-sm text-muted"><LogOut className="size-4" aria-hidden="true" />{signingOut ? "Signing out…" : "Sign out"}</button>{signOutError && <p role="alert" className="text-xs text-danger">{signOutError}</p>}</div>
          </aside>
        </div>
      )}

      <nav aria-label="Quick navigation" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        {navigation.map(({ href, label, icon: Icon }) => {
          const active = href === "/app" ? pathname === href : pathname.startsWith(href);
          return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium", active ? "text-primary" : "text-muted")}><Icon className="size-5" aria-hidden="true" />{label}</Link>;
        })}
      </nav>
    </div>
  );
}
