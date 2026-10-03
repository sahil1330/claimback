import type { ReconciliationInput } from "../../src/lib/reconciliation/engine";
import type { SkuCandidateInput, SkuInput } from "../../src/lib/ai/sku-match";
import type { Discrepancy } from "../../src/types/domain";

type Product = { name: string; code: string; unit: string; pack: string };
type DiscrepancyType = Discrepancy["type"];

export type EvaluationCase = {
  id: string;
  category: "short" | "rate" | "scheme" | "damage" | "combined" | "clean";
  artifacts: { invoice: string; supplierPromise: string; receivingStatement: string };
  /** Manually confirmed structured facts. No model extraction is invoked by this benchmark. */
  confirmedInput: ReconciliationInput;
  matching: {
    query: SkuInput;
    candidates: SkuCandidateInput[];
    expectedStatus: "matched" | "ambiguous" | "unmatched";
    expectedId: string | null;
  };
  expected: {
    outcome: "discrepancy" | "clean";
    types: DiscrepancyType[];
    totalPotentialRecoveryPaise: number;
  };
  /** Each step represents independently evidenced, posted credit on a later document. */
  recovery?: { creditPaise: number; expectedStatus: "missing" | "partial" | "full"; expectedOutstandingPaise: number }[];
};

type CaseSpec = {
  id: string;
  category: EvaluationCase["category"];
  product: Product;
  quantity: number;
  agreedRatePaise: number;
  billedRatePaise?: number;
  receivedPaid?: number;
  damaged?: number;
  scheme?: { buyQuantity: number; freeQuantity: number; receivedFree: number };
  expectedTypes: DiscrepancyType[];
  expectedPaise: number;
  recovery?: EvaluationCase["recovery"];
  match?: { query: SkuInput; candidates: SkuCandidateInput[]; expectedStatus: "ambiguous" | "unmatched" };
};

const parle: Product = { name: "Parle G 100g", code: "PG-100", unit: "box", pack: "100g" };
const crocin: Product = { name: "Crocin 500mg", code: "CR-500", unit: "strip", pack: "500mg" };
const surf: Product = { name: "Surf Excel 1kg", code: "SE-1KG", unit: "pack", pack: "1kg" };
const amul: Product = { name: "Amul Butter 100g", code: "AB-100", unit: "pack", pack: "100g" };
const dettol: Product = { name: "Dettol Soap 125g", code: "DS-125", unit: "case", pack: "125g" };
const himalaya: Product = { name: "Himalaya Face Wash 100ml", code: "HF-100", unit: "box", pack: "100ml" };
const maggi: Product = { name: "Maggi Masala 70g", code: "MM-70", unit: "box", pack: "70g" };
const dove: Product = { name: "Dove Soap 100g", code: "DV-100", unit: "box", pack: "100g" };
const colgate: Product = { name: "Colgate Maxfresh 200g", code: "CM-200", unit: "box", pack: "200g" };
const cetzine: Product = { name: "Cetzine 10mg", code: "CZ-10", unit: "strip", pack: "10mg" };
const lifebuoy: Product = { name: "Lifebuoy Handwash 200ml", code: "LH-200", unit: "bottle", pack: "200ml" };
const shampoo: Product = { name: "Clinic Plus Shampoo 200ml", code: "CP-200", unit: "bottle", pack: "200ml" };
const bulb: Product = { name: "Philips LED Bulb 9W", code: "PL-9W", unit: "piece", pack: "9W" };

const SHORT: DiscrepancyType = "SHORT_DELIVERY";
const RATE: DiscrepancyType = "RATE_MISMATCH";
const SCHEME: DiscrepancyType = "MISSING_SCHEME_UNITS";
const DAMAGE: DiscrepancyType = "DAMAGED_GOODS";

/** Expected totals below were reviewed as independent integer-paise arithmetic. */
const specs: CaseSpec[] = [
  { id: "S01", category: "short", product: parle, quantity: 60, agreedRatePaise: 1200, receivedPaid: 58, expectedTypes: [SHORT], expectedPaise: 2400,
    recovery: [{ creditPaise: 2400, expectedStatus: "full", expectedOutstandingPaise: 0 }],
    match: { query: { rawName: "Parle G", unit: "box" }, candidates: [
      { id: "PG-100", rawName: "Parle G 100g", unit: "box" },
      { id: "PG-200", rawName: "Parle G 200g", unit: "box" },
    ], expectedStatus: "ambiguous" } },
  { id: "S02", category: "short", product: crocin, quantity: 30, agreedRatePaise: 4500, receivedPaid: 29, expectedTypes: [SHORT], expectedPaise: 4500,
    recovery: [{ creditPaise: 0, expectedStatus: "missing", expectedOutstandingPaise: 4500 }, { creditPaise: 4500, expectedStatus: "full", expectedOutstandingPaise: 0 }] },
  { id: "S03", category: "short", product: surf, quantity: 24, agreedRatePaise: 15500, receivedPaid: 21, expectedTypes: [SHORT], expectedPaise: 46500 },
  { id: "S04", category: "short", product: amul, quantity: 40, agreedRatePaise: 5600, receivedPaid: 39, expectedTypes: [SHORT], expectedPaise: 5600 },
  { id: "S05", category: "short", product: dettol, quantity: 18, agreedRatePaise: 32000, receivedPaid: 16, expectedTypes: [SHORT], expectedPaise: 64000 },
  { id: "S06", category: "short", product: himalaya, quantity: 12, agreedRatePaise: 9800, receivedPaid: 11, expectedTypes: [SHORT], expectedPaise: 9800,
    match: { query: { rawName: "Himalaya Face Wash 100ml", packSize: "100ml" }, candidates: [
      { id: "DS-125", rawName: "Dettol Soap 125g", packSize: "125g" },
    ], expectedStatus: "unmatched" } },
  { id: "R01", category: "rate", product: maggi, quantity: 20, agreedRatePaise: 42800, billedRatePaise: 44100, expectedTypes: [RATE], expectedPaise: 26000,
    recovery: [{ creditPaise: 10000, expectedStatus: "partial", expectedOutstandingPaise: 16000 }, { creditPaise: 16000, expectedStatus: "full", expectedOutstandingPaise: 0 }] },
  { id: "R02", category: "rate", product: dove, quantity: 40, agreedRatePaise: 5200, billedRatePaise: 5400, expectedTypes: [RATE], expectedPaise: 8000 },
  { id: "R03", category: "rate", product: colgate, quantity: 25, agreedRatePaise: 8800, billedRatePaise: 9200, expectedTypes: [RATE], expectedPaise: 10000,
    match: { query: { rawName: "Colgate Maxfresh", unit: "box" }, candidates: [
      { id: "CM-100", rawName: "Colgate Maxfresh 100g", unit: "box" },
      { id: "CM-200", rawName: "Colgate Maxfresh 200g", unit: "box" },
    ], expectedStatus: "ambiguous" } },
  { id: "R04", category: "rate", product: cetzine, quantity: 100, agreedRatePaise: 850, billedRatePaise: 975, expectedTypes: [RATE], expectedPaise: 12500 },
  { id: "R05", category: "rate", product: lifebuoy, quantity: 36, agreedRatePaise: 7500, billedRatePaise: 7750, expectedTypes: [RATE], expectedPaise: 9000 },
  { id: "M01", category: "scheme", product: maggi, quantity: 50, agreedRatePaise: 42800, scheme: { buyQuantity: 10, freeQuantity: 1, receivedFree: 3 }, expectedTypes: [SCHEME], expectedPaise: 85600,
    recovery: [{ creditPaise: 0, expectedStatus: "missing", expectedOutstandingPaise: 85600 }] },
  { id: "M02", category: "scheme", product: parle, quantity: 24, agreedRatePaise: 1200, scheme: { buyQuantity: 12, freeQuantity: 1, receivedFree: 0 }, expectedTypes: [SCHEME], expectedPaise: 2400 },
  { id: "M03", category: "scheme", product: dettol, quantity: 30, agreedRatePaise: 3200, scheme: { buyQuantity: 5, freeQuantity: 1, receivedFree: 4 }, expectedTypes: [SCHEME], expectedPaise: 6400 },
  { id: "M04", category: "scheme", product: surf, quantity: 16, agreedRatePaise: 15500, scheme: { buyQuantity: 4, freeQuantity: 1, receivedFree: 3 }, expectedTypes: [SCHEME], expectedPaise: 15500 },
  { id: "D01", category: "damage", product: crocin, quantity: 10, agreedRatePaise: 30000, damaged: 2, expectedTypes: [DAMAGE], expectedPaise: 60000,
    recovery: [{ creditPaise: 60000, expectedStatus: "full", expectedOutstandingPaise: 0 }] },
  { id: "D02", category: "damage", product: shampoo, quantity: 20, agreedRatePaise: 9500, damaged: 1, expectedTypes: [DAMAGE], expectedPaise: 9500 },
  { id: "D03", category: "damage", product: bulb, quantity: 12, agreedRatePaise: 12500, damaged: 3, expectedTypes: [DAMAGE], expectedPaise: 37500 },
  { id: "C01", category: "combined", product: maggi, quantity: 50, agreedRatePaise: 42800, billedRatePaise: 44100, receivedPaid: 48, damaged: 2,
    scheme: { buyQuantity: 10, freeQuantity: 1, receivedFree: 3 }, expectedTypes: [SHORT, RATE, SCHEME, DAMAGE], expectedPaise: 321800,
    recovery: [{ creditPaise: 0, expectedStatus: "missing", expectedOutstandingPaise: 321800 }, { creditPaise: 100000, expectedStatus: "partial", expectedOutstandingPaise: 221800 }, { creditPaise: 221800, expectedStatus: "full", expectedOutstandingPaise: 0 }] },
  { id: "C02", category: "combined", product: dove, quantity: 24, agreedRatePaise: 5200, billedRatePaise: 5400, receivedPaid: 23, damaged: 1,
    scheme: { buyQuantity: 12, freeQuantity: 1, receivedFree: 1 }, expectedTypes: [SHORT, RATE, SCHEME, DAMAGE], expectedPaise: 20400,
    recovery: [{ creditPaise: 10000, expectedStatus: "partial", expectedOutstandingPaise: 10400 }] },
  { id: "C03", category: "combined", product: amul, quantity: 20, agreedRatePaise: 5600, billedRatePaise: 5800, receivedPaid: 18,
    scheme: { buyQuantity: 10, freeQuantity: 1, receivedFree: 0 }, expectedTypes: [SHORT, RATE, SCHEME], expectedPaise: 26400,
    recovery: [{ creditPaise: 26400, expectedStatus: "full", expectedOutstandingPaise: 0 }] },
  { id: "C04", category: "combined", product: bulb, quantity: 10, agreedRatePaise: 12500, billedRatePaise: 13000, receivedPaid: 9, damaged: 2,
    scheme: { buyQuantity: 5, freeQuantity: 1, receivedFree: 1 }, expectedTypes: [SHORT, RATE, SCHEME, DAMAGE], expectedPaise: 55000,
    recovery: [{ creditPaise: 0, expectedStatus: "missing", expectedOutstandingPaise: 55000 }] },
  { id: "N01", category: "clean", product: parle, quantity: 50, agreedRatePaise: 1200, expectedTypes: [], expectedPaise: 0 },
  { id: "N02", category: "clean", product: himalaya, quantity: 20, agreedRatePaise: 9800, scheme: { buyQuantity: 10, freeQuantity: 1, receivedFree: 2 }, expectedTypes: [], expectedPaise: 0,
    match: { query: { rawName: "Himalaya Face Wash", unit: "box" }, candidates: [
      { id: "HF-100", rawName: "Himalaya Face Wash 100ml", unit: "box" },
      { id: "HF-200", rawName: "Himalaya Face Wash 200ml", unit: "box" },
    ], expectedStatus: "ambiguous" } },
  { id: "N03", category: "clean", product: crocin, quantity: 30, agreedRatePaise: 4500, expectedTypes: [], expectedPaise: 0 },
];

function rupees(paise: number): string {
  return `₹${Math.trunc(paise / 100)}.${String(paise % 100).padStart(2, "0")}`;
}

function artifactId(index: number, role: number): string {
  return `00000000-0000-4000-8000-${String(index * 10 + role).padStart(12, "0")}`;
}

function toFixture(spec: CaseSpec, index: number): EvaluationCase {
  const { product } = spec;
  const billedRatePaise = spec.billedRatePaise ?? spec.agreedRatePaise;
  const receivedPaid = spec.receivedPaid ?? spec.quantity;
  const damaged = spec.damaged ?? 0;
  const schemeText = spec.scheme ? `, buy ${spec.scheme.buyQuantity} get ${spec.scheme.freeQuantity} free` : "";
  const agreement = `${product.name} (${product.code}): ${spec.quantity} ${product.unit} at ${rupees(spec.agreedRatePaise)} each${schemeText}.`;
  const invoice = `Invoice INV-EVAL-${spec.id}: ${product.name} (${product.code}), ${spec.quantity} ${product.unit} at ${rupees(billedRatePaise)} each.`;
  const receiving = `${product.name}: ${receivedPaid} paid ${product.unit} arrived, ${damaged} damaged${spec.scheme ? `, ${spec.scheme.receivedFree} free ${product.unit} arrived` : ""}. Count confirmed by merchant.`;
  const common = { rawName: product.name, skuRef: product.code, unit: product.unit, packSize: product.pack, confidence: "high" as const, uncertainties: [] };
  const source = (role: number, label: string, excerpt: string) => ({
    sourceArtifactId: artifactId(index, role), sourceLabel: label, excerpt, locator: role === 3 ? "merchant count" : "line 1",
  });
  return {
    id: spec.id,
    category: spec.category,
    artifacts: { invoice, supplierPromise: agreement, receivingStatement: receiving },
    confirmedInput: { groups: [{
      skuRef: product.code,
      matchStatus: spec.match ? "merchant_confirmed" : "matched",
      promised: { ...common, quantity: spec.quantity, unitPricePaise: spec.agreedRatePaise, discountPaise: null,
        scheme: spec.scheme ? { buyQuantity: spec.scheme.buyQuantity, freeQuantity: spec.scheme.freeQuantity } : null,
        source: source(1, "Supplier promise", agreement) },
      billed: { ...common, quantity: spec.quantity, unitPricePaise: billedRatePaise, discountPaise: null,
        source: source(2, `Invoice INV-EVAL-${spec.id}`, invoice) },
      received: { ...common, receivedQuantity: receivedPaid, damagedQuantity: damaged,
        receivedFreeQuantity: spec.scheme?.receivedFree ?? null, merchantConfirmed: true,
        source: source(3, "Merchant confirmed count", receiving) },
    }] },
    matching: spec.match ? { ...spec.match, expectedId: null } : {
      query: { rawName: product.name, skuCode: product.code, unit: product.unit, packSize: product.pack },
      candidates: [{ id: product.code, rawName: product.name, skuCode: product.code, unit: product.unit, packSize: product.pack }],
      expectedStatus: "matched", expectedId: product.code,
    },
    expected: { outcome: spec.category === "clean" ? "clean" : "discrepancy", types: spec.expectedTypes,
      totalPotentialRecoveryPaise: spec.expectedPaise },
    recovery: spec.recovery,
  };
}

export const evaluationCases: EvaluationCase[] = specs.map(toFixture);
