/** Read-only display contracts for the B2 screens. A6 owns the persisted balances. */
export const caseStatuses = [
  "DRAFT",
  "EVIDENCE_CAPTURED",
  "RECONCILED",
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
] as const;

export type CaseStatus = (typeof caseStatuses)[number];

export type CaseHistory = {
  id: string;
  supplierId: string | null;
  status: CaseStatus;
  title: string | null;
  potentialRecoveryPaise: bigint;
  recoveredPaise: bigint;
  outstandingPaise: bigint;
  claimSentAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

export type SupplierHistory = { id: string; name: string };

export type DashboardSummary = {
  marginProtectedPaise: bigint;
  leakageDetectedPaise: bigint;
  recoveredPaise: bigint;
  pendingRecoveryPaise: bigint;
  openClaims: number;
  caseCount: number;
  attentionCases: CaseHistory[];
};

export type SupplierSummary = {
  id: string;
  name: string;
  deliveryCount: number;
  discrepancyCount: number;
  cleanDeliveryRate: number | null;
  discrepancyRate: number | null;
  claimedPaise: bigint;
  recoveredPaise: bigint;
  pendingRecoveryPaise: bigint;
  averageResolutionDays: number | null;
};

const evaluatedStatuses = new Set<CaseStatus>([
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

const attentionStatuses = new Set<CaseStatus>([
  "DISCREPANCY_FOUND",
  "AWAITING_MERCHANT_APPROVAL",
  "CLAIM_SENT",
  "AWAITING_SUPPLIER",
  "SUPPLIER_RESPONDED",
  "AWAITING_RECOVERY",
  "RECOVERY_VERIFICATION",
  "ESCALATED",
]);

export function getDashboardSummary(cases: CaseHistory[]): DashboardSummary {
  let leakageDetectedPaise = BigInt(0);
  let recoveredPaise = BigInt(0);
  let pendingRecoveryPaise = BigInt(0);
  let openClaims = 0;

  for (const item of cases) {
    leakageDetectedPaise += item.potentialRecoveryPaise;
    recoveredPaise += item.recoveredPaise;
    if (item.claimSentAt && item.status !== "RESOLVED") {
      pendingRecoveryPaise += item.outstandingPaise;
    }
    if (
      item.status !== "RESOLVED" &&
      (item.claimSentAt || item.status === "AWAITING_MERCHANT_APPROVAL")
    ) {
      openClaims += 1;
    }
  }

  return {
    marginProtectedPaise: recoveredPaise,
    leakageDetectedPaise,
    recoveredPaise,
    pendingRecoveryPaise,
    openClaims,
    caseCount: cases.length,
    attentionCases: cases
      .filter((item) => attentionStatuses.has(item.status))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 4),
  };
}

export function getSupplierSummaries(
  suppliers: SupplierHistory[],
  cases: CaseHistory[],
): SupplierSummary[] {
  return suppliers.map((supplier) => {
    const history = cases.filter((item) => item.supplierId === supplier.id);
    const evaluated = history.filter((item) => evaluatedStatuses.has(item.status));
    const discrepancyCount = evaluated.filter((item) => item.status !== "NO_DISCREPANCY").length;
    const resolvedDurations = history
      .filter((item) => item.status === "RESOLVED" && item.resolvedAt)
      .map((item) => Date.parse(item.resolvedAt!) - Date.parse(item.createdAt))
      .filter((duration) => Number.isFinite(duration) && duration >= 0);

    return {
      id: supplier.id,
      name: supplier.name,
      deliveryCount: evaluated.length,
      discrepancyCount,
      cleanDeliveryRate: evaluated.length ? (evaluated.length - discrepancyCount) / evaluated.length : null,
      discrepancyRate: evaluated.length ? discrepancyCount / evaluated.length : null,
      claimedPaise: history.reduce(
        (total, item) => total + (item.claimSentAt ? item.potentialRecoveryPaise : BigInt(0)),
        BigInt(0),
      ),
      recoveredPaise: history.reduce((total, item) => total + item.recoveredPaise, BigInt(0)),
      pendingRecoveryPaise: history.reduce(
        (total, item) => total + (item.claimSentAt && item.status !== "RESOLVED" ? item.outstandingPaise : BigInt(0)),
        BigInt(0),
      ),
      averageResolutionDays: resolvedDurations.length
        ? resolvedDurations.reduce((total, duration) => total + duration, 0) /
          resolvedDurations.length /
          86_400_000
        : null,
    };
  });
}

export function formatPaise(amountPaise: bigint): string {
  const rupees = amountPaise / BigInt(100);
  const paise = amountPaise % BigInt(100);
  return `₹${rupees.toLocaleString("en-IN")}${paise ? `.${paise.toString().padStart(2, "0")}` : ""}`;
}

export function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}
