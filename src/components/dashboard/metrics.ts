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

export function formatPaise(amountPaise: bigint): string {
  const rupees = amountPaise / BigInt(100);
  const paise = amountPaise % BigInt(100);
  return `₹${rupees.toLocaleString("en-IN")}${paise ? `.${paise.toString().padStart(2, "0")}` : ""}`;
}

export function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}
