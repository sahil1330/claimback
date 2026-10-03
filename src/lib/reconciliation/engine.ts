import { z } from "zod";
import { matchSku } from "../ai/sku-match";
import { transitionCaseState, type CaseState } from "../cases/state";
import {
  billedLineSchema,
  discrepancySchema,
  promisedLineSchema,
  receivedLineSchema,
  type ConfirmationRequest,
  type Discrepancy,
  type SourceEvidence,
} from "../../types/domain";
import {
  addPaise,
  damageValuePaise,
  multiplyPaise,
  rateMismatchValuePaise,
  shortDeliveryQuantity,
  shortDeliveryValuePaise,
} from "./money";
import { expectedFreeQuantity, missingFreeQuantity } from "./schemes";

export const reconciliationGroupSchema = z.object({
  skuRef: z.string().min(1),
  matchStatus: z.enum(["matched", "merchant_confirmed", "ambiguous", "unmatched"]),
  promised: promisedLineSchema,
  billed: billedLineSchema,
  received: receivedLineSchema,
});

export const reconciliationInputSchema = z.object({
  groups: z.array(reconciliationGroupSchema).min(1),
});

export type ReconciliationGroup = z.infer<typeof reconciliationGroupSchema>;
export type ReconciliationInput = z.infer<typeof reconciliationInputSchema>;

export type ReconciliationResult =
  | {
      outcome: "needs_confirmation";
      caseState: null;
      discrepancies: [];
      totalPotentialRecoveryPaise: 0;
      confirmations: ConfirmationRequest[];
      message: string;
    }
  | {
      outcome: "clean";
      caseState: "NO_DISCREPANCY";
      discrepancies: [];
      totalPotentialRecoveryPaise: 0;
      confirmations: [];
      message: "Delivery looks correct. No claim required.";
    }
  | {
      outcome: "discrepancy";
      caseState: "DISCREPANCY_FOUND";
      discrepancies: Discrepancy[];
      totalPotentialRecoveryPaise: number;
      confirmations: [];
      message: string;
    };

function requestConfirmation(
  requests: ConfirmationRequest[],
  field: string,
  reason: string,
  source: SourceEvidence,
) {
  if (!requests.some((request) => request.field === field)) {
    requests.push({ field, reason, source });
  }
}

function sourceIsGrounded(source: SourceEvidence) {
  return Boolean(source.excerpt || source.locator);
}

function requiresConfirmation(group: ReconciliationGroup, index: number): ConfirmationRequest[] {
  const requests: ConfirmationRequest[] = [];
  const lines = [
    ["promised", group.promised],
    ["billed", group.billed],
    ["received", group.received],
  ] as const;
  for (const [kind, line] of lines) {
    const base = `groups.${index}.${kind}`;
    if (!sourceIsGrounded(line.source)) requestConfirmation(requests, `${base}.source`, "Evidence excerpt or locator is missing", line.source);
    if (line.confidence !== "high" || line.uncertainties.length > 0) requestConfirmation(requests, base, "Evidence has unresolved uncertainty", line.source);
  }

  if (!group.received.merchantConfirmed) requestConfirmation(requests, `groups.${index}.received.merchantConfirmed`, "Merchant must confirm received and damaged counts", group.received.source);
  if (group.matchStatus === "ambiguous" || group.matchStatus === "unmatched") {
    requestConfirmation(requests, `groups.${index}.skuRef`, "Product match requires merchant confirmation", group.promised.source);
  } else if (group.matchStatus === "matched") {
    const toCandidate = (line: ReconciliationGroup["billed"] | ReconciliationGroup["received"], id: string) => ({
      id, rawName: line.rawName, skuCode: line.skuRef, unit: line.unit, packSize: line.packSize,
    });
    const query = {
      rawName: group.promised.rawName,
      skuCode: group.promised.skuRef,
      unit: group.promised.unit,
      packSize: group.promised.packSize,
    };
    if (matchSku(query, [toCandidate(group.billed, "billed")]).status !== "matched" ||
        matchSku(query, [toCandidate(group.received, "received")]).status !== "matched") {
      requestConfirmation(requests, `groups.${index}.skuRef`, "Product identity or unit is not an exact safe match", group.promised.source);
    }
  }

  if (group.promised.quantity === null || group.billed.quantity === null) {
    requestConfirmation(requests, `groups.${index}.quantity`, "Promised or billed quantity is missing", group.promised.source);
  } else if (group.promised.quantity !== group.billed.quantity) {
    requestConfirmation(requests, `groups.${index}.quantity`, "Promised and billed paid quantities differ", group.promised.source);
  }
  if (group.received.receivedQuantity === null || group.received.damagedQuantity === null) {
    requestConfirmation(requests, `groups.${index}.received`, "Paid or damaged receiving count is missing", group.received.source);
  } else if (group.billed.quantity !== null && group.received.receivedQuantity > group.billed.quantity) {
    requestConfirmation(requests, `groups.${index}.received.receivedQuantity`, "More paid units arrived than were billed", group.received.source);
  }
  if (group.promised.unitPricePaise === null || group.billed.unitPricePaise === null) {
    requestConfirmation(requests, `groups.${index}.unitPricePaise`, "Agreed or billed unit rate is missing", group.promised.source);
  } else if (group.promised.unitPricePaise === 0 || group.billed.unitPricePaise === 0) {
    requestConfirmation(requests, `groups.${index}.unitPricePaise`, "A zero unit rate needs merchant confirmation", group.promised.source);
  }
  if ((group.promised.discountPaise ?? 0) > 0 || (group.billed.discountPaise ?? 0) > 0) {
    requestConfirmation(requests, `groups.${index}.discountPaise`, "Printed discount needs confirmation before rate comparison", group.billed.source);
  }
  if (group.promised.scheme) {
    if (group.received.receivedFreeQuantity === null) {
      requestConfirmation(requests, `groups.${index}.received.receivedFreeQuantity`, "Free scheme units need merchant confirmation", group.received.source);
    } else if (group.billed.quantity !== null) {
      const expected = expectedFreeQuantity(group.billed.quantity, group.promised.scheme.buyQuantity, group.promised.scheme.freeQuantity);
      if (group.received.receivedFreeQuantity > expected) {
        requestConfirmation(requests, `groups.${index}.received.receivedFreeQuantity`, "More free units arrived than the stated entitlement", group.received.source);
      }
    }
  } else if ((group.received.receivedFreeQuantity ?? 0) > 0) {
    requestConfirmation(requests, `groups.${index}.received.receivedFreeQuantity`, "Free units were received without a documented scheme", group.received.source);
  }
  return requests;
}

function discrepancy(
  group: ReconciliationGroup,
  groupIndex: number,
  type: Discrepancy["type"],
  affectedQuantity: number,
  amountPaise: number,
  calculation: Discrepancy["calculation"],
  description: string,
): Discrepancy {
  return discrepancySchema.parse({
    id: `${groupIndex}:${group.skuRef}:${type}`,
    type,
    skuRef: group.skuRef,
    description,
    affectedQuantity,
    expectedUnitPricePaise: group.promised.unitPricePaise,
    billedUnitPricePaise: group.billed.unitPricePaise,
    amountPaise,
    calculation,
    promisedEvidence: group.promised.source,
    billedEvidence: group.billed.source,
    receivedEvidence: group.received.source,
    confidence: "high",
    status: "supported",
  });
}

function reconcileGroup(group: ReconciliationGroup, groupIndex: number): Discrepancy[] {
  const billedQuantity = group.billed.quantity!;
  const receivedQuantity = group.received.receivedQuantity!;
  const damagedQuantity = group.received.damagedQuantity!;
  const agreedRate = group.promised.unitPricePaise!;
  const billedRate = group.billed.unitPricePaise!;
  const missingPaid = shortDeliveryQuantity(billedQuantity, receivedQuantity);
  // A paid unit is missing, damaged, or saleable. Rate variance applies only
  // to saleable units so combined claims cannot bill the same unit twice.
  const saleablePaid = receivedQuantity - damagedQuantity;
  const discrepancies: Discrepancy[] = [];

  if (missingPaid > 0) {
    discrepancies.push(discrepancy(group, groupIndex, "SHORT_DELIVERY", missingPaid,
      shortDeliveryValuePaise(billedQuantity, receivedQuantity, billedRate),
      { kind: "short_delivery", inputs: { billedQuantity, receivedQuantity, missingQuantity: missingPaid, billedUnitPricePaise: billedRate } },
      `${missingPaid} paid units were billed but did not arrive`));
  }

  const rateValue = rateMismatchValuePaise(agreedRate, billedRate, saleablePaid);
  if (rateValue > 0) {
    discrepancies.push(discrepancy(group, groupIndex, "RATE_MISMATCH", saleablePaid, rateValue,
      { kind: "rate_mismatch", inputs: { agreedUnitPricePaise: agreedRate, billedUnitPricePaise: billedRate, saleableReceivedQuantity: saleablePaid } },
      "Billed rate exceeds the supplier's agreed rate on usable paid units"));
  }

  if (group.promised.scheme) {
    const { buyQuantity, freeQuantity } = group.promised.scheme;
    const expected = expectedFreeQuantity(billedQuantity, buyQuantity, freeQuantity);
    const receivedFree = group.received.receivedFreeQuantity!;
    const missingFree = missingFreeQuantity(expected, receivedFree);
    if (missingFree > 0) {
      discrepancies.push(discrepancy(group, groupIndex, "MISSING_SCHEME_UNITS", missingFree,
        multiplyPaise(agreedRate, missingFree),
        { kind: "missing_scheme_units", inputs: { paidQuantity: billedQuantity, buyQuantity, freeQuantity, expectedFreeQuantity: expected, receivedFreeQuantity: receivedFree, missingFreeQuantity: missingFree, agreedUnitPricePaise: agreedRate } },
        `${missingFree} free scheme units were promised but did not arrive`));
    }
  }

  if (damagedQuantity > 0) {
    discrepancies.push(discrepancy(group, groupIndex, "DAMAGED_GOODS", damagedQuantity,
      damageValuePaise(damagedQuantity, billedRate),
      { kind: "damaged_goods", inputs: { damagedQuantity, billedUnitPricePaise: billedRate } },
      `${damagedQuantity} received paid units were damaged`));
  }

  return discrepancies;
}

/** Reconcile only complete, confirmed, source-grounded three-truth groups. */
export function reconcileCase(input: ReconciliationInput): ReconciliationResult {
  const parsed = reconciliationInputSchema.parse(input);
  const confirmations = parsed.groups.flatMap((group, index) => requiresConfirmation(group, index));
  if (confirmations.length > 0) {
    return {
      outcome: "needs_confirmation", caseState: null, discrepancies: [],
      totalPotentialRecoveryPaise: 0, confirmations,
      message: "Confirm uncertain facts before calculating a claim.",
    };
  }
  const discrepancies = parsed.groups.flatMap(reconcileGroup);
  if (discrepancies.length === 0) {
    return {
      outcome: "clean", caseState: "NO_DISCREPANCY", discrepancies: [],
      totalPotentialRecoveryPaise: 0, confirmations: [],
      message: "Delivery looks correct. No claim required.",
    };
  }
  return {
    outcome: "discrepancy", caseState: "DISCREPANCY_FOUND", discrepancies,
    totalPotentialRecoveryPaise: addPaise(...discrepancies.map((item) => item.amountPaise)),
    confirmations: [], message: `${discrepancies.length} discrepancies found`,
  };
}

/** Return legal states for a persistence tool to apply after a confirmed reconciliation. */
export function transitionForReconciliation(
  current: CaseState,
  result: ReconciliationResult,
): CaseState[] {
  if (result.outcome === "needs_confirmation") return [];
  const steps: CaseState[] = [];
  const reconciled = current === "EVIDENCE_CAPTURED"
    ? transitionCaseState(current, "RECONCILED")
    : current;
  if (current === "EVIDENCE_CAPTURED") steps.push(reconciled);
  const final = transitionCaseState(reconciled, result.caseState, {
    factsConfirmed: true,
    discrepancyCount: result.discrepancies.length,
  });
  steps.push(final);
  return steps;
}
