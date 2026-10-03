import { describe, expect, it } from "vitest";
import { reconcileCase, transitionForReconciliation, type ReconciliationGroup } from "./engine";

const promisedSource = {
  sourceArtifactId: "f4cc15b4-8614-45ef-ab6b-ad7fb85beea3",
  sourceLabel: "Supplier agreement",
  excerpt: "Maggi 70g 50 boxes at ₹428, buy 10 get 1",
  locator: "message 1",
};
const billedSource = {
  sourceArtifactId: "a395d119-3b6a-42b9-9566-311fd2d6a9c0",
  sourceLabel: "Invoice INV-3812",
  excerpt: "Maggi 70g 50 boxes at ₹441",
  locator: "row 1",
};
const receivedSource = {
  sourceArtifactId: "74cf1e2f-58fd-486c-98f3-02db5b0030bb",
  sourceLabel: "Merchant receiving confirmation",
  excerpt: "Maggi 48 paid boxes, 3 free boxes, 2 damaged",
  locator: null,
};

function group(): ReconciliationGroup {
  const common = {
    rawName: "Maggi 70g",
    skuRef: "MG-70",
    unit: "boxes",
    packSize: "70g",
    confidence: "high" as const,
    uncertainties: [],
  };
  return {
    skuRef: "MG-70",
    matchStatus: "matched",
    promised: {
      ...common, quantity: 50, unitPricePaise: 42800, discountPaise: null,
      scheme: null, source: promisedSource,
    },
    billed: {
      ...common, quantity: 50, unitPricePaise: 42800, discountPaise: null,
      source: billedSource,
    },
    received: {
      ...common, receivedQuantity: 50, receivedFreeQuantity: null,
      damagedQuantity: 0, merchantConfirmed: true, source: receivedSource,
    },
  };
}

function moneyText(paise: number | null) {
  if (paise === null) return "unclear";
  return `₹${Math.trunc(paise / 100)}.${String(paise % 100).padStart(2, "0")}`;
}

function reconcileFixture(line: ReconciliationGroup) {
  line.promised.source = {
    ...promisedSource,
    excerpt: `${line.promised.rawName}, ${line.promised.quantity} ${line.promised.unit} at ${moneyText(line.promised.unitPricePaise)}${line.promised.scheme ? `, buy ${line.promised.scheme.buyQuantity} get ${line.promised.scheme.freeQuantity}` : ""}`,
  };
  line.billed.source = {
    ...billedSource,
    excerpt: `${line.billed.rawName}, ${line.billed.quantity} ${line.billed.unit} at ${moneyText(line.billed.unitPricePaise)}`,
  };
  line.received.source = {
    ...receivedSource,
    excerpt: `${line.received.rawName}, ${line.received.receivedQuantity} paid, ${line.received.receivedFreeQuantity ?? "unspecified"} free, ${line.received.damagedQuantity} damaged`,
  };
  return reconcileCase({ groups: [line] });
}

describe("deterministic source-grounded reconciliation", () => {
  it("T1 values short delivery in integer paise", () => {
    const line = group();
    line.promised.unitPricePaise = 10000;
    line.billed.unitPricePaise = 10000;
    line.received.receivedQuantity = 48;
    const result = reconcileFixture(line);
    expect(result.outcome).toBe("discrepancy");
    expect(result.totalPotentialRecoveryPaise).toBe(20000);
    expect(result.discrepancies).toMatchObject([{
      type: "SHORT_DELIVERY", affectedQuantity: 2, amountPaise: 20000,
      calculation: { kind: "short_delivery", inputs: { billedQuantity: 50, receivedQuantity: 48, missingQuantity: 2 } },
    }]);
  });

  it("T2 values rate mismatch on usable paid units", () => {
    const line = group();
    line.promised.quantity = 20;
    line.billed.quantity = 20;
    line.billed.unitPricePaise = 44100;
    line.received.receivedQuantity = 20;
    const result = reconcileFixture(line);
    expect(result.totalPotentialRecoveryPaise).toBe(26000);
    expect(result.discrepancies).toMatchObject([{ type: "RATE_MISMATCH", affectedQuantity: 20, amountPaise: 26000 }]);
  });

  it("T3 values two missing free units from a 10+1 promise", () => {
    const line = group();
    line.promised.unitPricePaise = 10000;
    line.billed.unitPricePaise = 10000;
    line.promised.scheme = { buyQuantity: 10, freeQuantity: 1 };
    line.received.receivedFreeQuantity = 3;
    const result = reconcileFixture(line);
    expect(result.totalPotentialRecoveryPaise).toBe(20000);
    expect(result.discrepancies).toMatchObject([{
      type: "MISSING_SCHEME_UNITS", affectedQuantity: 2, amountPaise: 20000,
      calculation: { inputs: { paidQuantity: 50, expectedFreeQuantity: 5, receivedFreeQuantity: 3 } },
    }]);
  });

  it("T4 values damaged paid units at the billed rate", () => {
    const line = group();
    line.promised.quantity = 10;
    line.billed.quantity = 10;
    line.received.receivedQuantity = 10;
    line.received.damagedQuantity = 2;
    line.promised.unitPricePaise = 30000;
    line.billed.unitPricePaise = 30000;
    const result = reconcileFixture(line);
    expect(result.totalPotentialRecoveryPaise).toBe(60000);
    expect(result.discrepancies).toMatchObject([{ type: "DAMAGED_GOODS", affectedQuantity: 2, amountPaise: 60000 }]);
  });

  it("T5 combines four discrepancies without counting a paid unit twice", () => {
    const line = group();
    line.billed.unitPricePaise = 44100;
    line.promised.scheme = { buyQuantity: 10, freeQuantity: 1 };
    line.received.receivedQuantity = 48;
    line.received.receivedFreeQuantity = 3;
    line.received.damagedQuantity = 2;
    const result = reconcileFixture(line);
    expect(result.caseState).toBe("DISCREPANCY_FOUND");
    expect(result.discrepancies.map((item) => [item.type, item.amountPaise])).toEqual([
      ["SHORT_DELIVERY", 88200],
      ["RATE_MISMATCH", 59800],
      ["MISSING_SCHEME_UNITS", 85600],
      ["DAMAGED_GOODS", 88200],
    ]);
    expect(result.totalPotentialRecoveryPaise).toBe(321800);
    for (const item of result.discrepancies) {
      expect(item.promisedEvidence.sourceArtifactId).toBe(promisedSource.sourceArtifactId);
      expect(item.billedEvidence.sourceArtifactId).toBe(billedSource.sourceArtifactId);
      expect(item.receivedEvidence.sourceArtifactId).toBe(receivedSource.sourceArtifactId);
      expect(Object.keys(item.calculation.inputs).length).toBeGreaterThan(0);
    }
  });

  it("T10 clean delivery has no claim or recovery amount", () => {
    const line = group();
    line.promised.scheme = { buyQuantity: 10, freeQuantity: 1 };
    line.received.receivedFreeQuantity = 5;
    const result = reconcileFixture(line);
    expect(result).toMatchObject({
      outcome: "clean", caseState: "NO_DISCREPANCY",
      discrepancies: [], totalPotentialRecoveryPaise: 0,
      message: "Delivery looks correct. No claim required.",
    });
  });

  it("turns a confirmed clean or discrepancy result into legal state steps", () => {
    const clean = reconcileFixture(group());
    expect(transitionForReconciliation("EVIDENCE_CAPTURED", clean)).toEqual(["RECONCILED", "NO_DISCREPANCY"]);
    const short = group();
    short.received.receivedQuantity = 48;
    expect(transitionForReconciliation("RECONCILED", reconcileFixture(short))).toEqual(["DISCREPANCY_FOUND"]);
    expect(() => transitionForReconciliation("DRAFT", clean)).toThrow();
  });

  it("holds unconfirmed receiving and ambiguous SKU without a financial claim", () => {
    const line = group();
    line.received.merchantConfirmed = false;
    line.matchStatus = "ambiguous";
    line.billed.unitPricePaise = 44100;
    const result = reconcileFixture(line);
    expect(result).toMatchObject({
      outcome: "needs_confirmation", caseState: null,
      discrepancies: [], totalPotentialRecoveryPaise: 0,
    });
    expect(result.confirmations.map((item) => item.field)).toContain("groups.0.skuRef");
  });

  it("does not invent a missing scheme claim when received free count is unknown", () => {
    const line = group();
    line.promised.scheme = { buyQuantity: 10, freeQuantity: 1 };
    const result = reconcileFixture(line);
    expect(result.outcome).toBe("needs_confirmation");
    expect(result.totalPotentialRecoveryPaise).toBe(0);
    expect(result.confirmations.map((item) => item.field)).toContain("groups.0.received.receivedFreeQuantity");
  });

  it("holds uncertain AI fields and unresolved discounts", () => {
    const line = group();
    line.promised.uncertainties = [{ field: "unitPricePaise", reason: "smudged" }];
    line.billed.discountPaise = 1000;
    const result = reconcileFixture(line);
    expect(result.outcome).toBe("needs_confirmation");
    expect(result.discrepancies).toEqual([]);
    expect(result.confirmations.map((item) => item.field)).toContain("groups.0.discountPaise");
  });
});
