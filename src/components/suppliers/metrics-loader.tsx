"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import SuppliersLoading from "@/app/app/suppliers/loading";
import type { SupplierMetrics } from "@/lib/suppliers/metrics";
import { fetchSupplierMetrics } from "./metrics-api";
import { SuppliersOverview } from "./overview";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; suppliers: SupplierMetrics[] };

export function SupplierMetricsLoader() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchSupplierMetrics(controller.signal).then(
      (suppliers) => setState({ status: "ready", suppliers }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Could not load supplier history.",
        });
      },
    );
    return () => controller.abort();
  }, [attempt]);

  if (state.status === "loading") return <SuppliersLoading />;
  if (state.status === "error") {
    return (
      <div role="alert" className="rounded-2xl border border-border bg-surface p-6">
        <h1 className="text-xl font-semibold">Supplier history is unavailable</h1>
        <p className="mt-2 text-sm text-muted">{state.message}</p>
        <Button className="mt-5" onClick={() => {
          setState({ status: "loading" });
          setAttempt((value) => value + 1);
        }}>Try again</Button>
      </div>
    );
  }
  return <SuppliersOverview suppliers={state.suppliers} />;
}
