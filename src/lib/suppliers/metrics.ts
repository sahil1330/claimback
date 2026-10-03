/** Merchant-owned case history is the only input to supplier intelligence. */
export type SupplierRecord = { id: string; name: string };

export type SupplierCaseRecord = {
  supplierId: string | null;
  status: string;
  potentialRecoveryPaise: bigint;
  recoveredPaise: bigint;
  outstandingPaise: bigint;
  claimSentAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

export type SupplierMetrics = {
  id: string;
  name: string;
  caseCount: number;
  /** Reconciled deliveries; the denominator for the two delivery rates. */
  deliveryCount: number;
  cleanDeliveryCount: number;
  discrepancyCount: number;
  cleanDeliveryRate: number | null;
  discrepancyRate: number | null;
  /** Only claims actually sent to the supplier contribute to claimed and pending. */
  claimCount: number;
  claimedPaise: bigint;
  recoveredPaise: bigint;
  pendingRecoveryPaise: bigint;
  /** Resolved cases with valid timestamps; the resolution average denominator. */
  resolutionSampleCount: number;
  averageResolutionDays: number | null;
};

export type SupplierMetricsResponse = Omit<
  SupplierMetrics,
  "claimedPaise" | "recoveredPaise" | "pendingRecoveryPaise"
> & {
  /** Base-10 integer strings preserve exact paise through JSON. */
  claimedPaise: string;
  recoveredPaise: string;
  pendingRecoveryPaise: string;
};

const evaluatedStatuses = new Set([
  "NO_DISCREPANCY",
  "DISCREPANCY_FOUND",
  "AWAITING_MERCHANT_APPROVAL",
  "CLAIM_SENT",
  "AWAITING_SUPPLIER",
  "SUPPLIER_RESPONDED",
  "AWAITING_RECOVERY",
  "RECOVERY_VERIFICATION",
  "RESOLVED",
  "ESCALATED",
]);

const millisecondsPerDay = 86_400_000;

export function aggregateSupplierMetrics(
  suppliers: SupplierRecord[],
  cases: SupplierCaseRecord[],
): SupplierMetrics[] {
  const bySupplier = new Map<string, SupplierCaseRecord[]>();
  for (const item of cases) {
    if (!item.supplierId) continue;
    const history = bySupplier.get(item.supplierId) ?? [];
    history.push(item);
    bySupplier.set(item.supplierId, history);
  }

  return suppliers.map((supplier) => {
    const history = bySupplier.get(supplier.id) ?? [];
    let deliveryCount = 0;
    let cleanDeliveryCount = 0;
    let claimCount = 0;
    let claimedPaise = BigInt(0);
    let recoveredPaise = BigInt(0);
    let pendingRecoveryPaise = BigInt(0);
    let resolutionSampleCount = 0;
    let resolutionDurationMs = 0;

    for (const item of history) {
      if (evaluatedStatuses.has(item.status)) {
        deliveryCount += 1;
        if (item.status === "NO_DISCREPANCY") cleanDeliveryCount += 1;
      }
      if (item.claimSentAt) {
        claimCount += 1;
        claimedPaise += item.potentialRecoveryPaise;
        if (item.status !== "RESOLVED") {
          pendingRecoveryPaise += item.outstandingPaise;
        }
      }
      recoveredPaise += item.recoveredPaise;

      if (item.status === "RESOLVED" && item.resolvedAt) {
        const duration = Date.parse(item.resolvedAt) - Date.parse(item.createdAt);
        if (Number.isFinite(duration) && duration >= 0) {
          resolutionSampleCount += 1;
          resolutionDurationMs += duration;
        }
      }
    }

    const discrepancyCount = deliveryCount - cleanDeliveryCount;
    return {
      id: supplier.id,
      name: supplier.name,
      caseCount: history.length,
      deliveryCount,
      cleanDeliveryCount,
      discrepancyCount,
      cleanDeliveryRate: deliveryCount ? cleanDeliveryCount / deliveryCount : null,
      discrepancyRate: deliveryCount ? discrepancyCount / deliveryCount : null,
      claimCount,
      claimedPaise,
      recoveredPaise,
      pendingRecoveryPaise,
      resolutionSampleCount,
      averageResolutionDays: resolutionSampleCount
        ? resolutionDurationMs / resolutionSampleCount / millisecondsPerDay
        : null,
    };
  });
}

export function serializeSupplierMetrics(metrics: SupplierMetrics): SupplierMetricsResponse {
  return {
    ...metrics,
    claimedPaise: metrics.claimedPaise.toString(),
    recoveredPaise: metrics.recoveredPaise.toString(),
    pendingRecoveryPaise: metrics.pendingRecoveryPaise.toString(),
  };
}
