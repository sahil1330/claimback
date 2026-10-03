import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../auth/session", () => ({ requireMerchant: vi.fn() }));
vi.mock("../auth/case-access", () => ({ assertCaseOwnership: vi.fn() }));
vi.mock("../supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("./events", () => ({ appendCaseEvent: vi.fn() }));
import { verifyEvidenceSources } from "./facts";

const caseId = "5d5dc89e-aeeb-4afe-9b2e-dde126e7cece";
const agreementId = "f4cc15b4-8614-45ef-ab6b-ad7fb85beea3";
const invoiceId = "a395d119-3b6a-42b9-9566-311fd2d6a9c0";
const source = (sourceArtifactId: string, sourceLabel: string) => ({
  sourceArtifactId, sourceLabel, excerpt: "Documented count and rate", locator: "line 1",
});
const common = { rawName: "Soap", skuRef: "SOAP", unit: "boxes", packSize: null, confidence: "high" as const, uncertainties: [] };
const promised = { ...common, quantity: 10, unitPricePaise: 10000, discountPaise: null, scheme: null, source: source(agreementId, "Supplier agreement") };
const billed = { ...common, quantity: 10, unitPricePaise: 10000, discountPaise: null, source: source(invoiceId, "Invoice") };
const received = { ...common, receivedQuantity: 9, receivedFreeQuantity: null, damagedQuantity: 0, merchantConfirmed: true,
  source: source(caseId, "Merchant-confirmed receiving input") };
const input = { groups: [{ skuRef: "SOAP", matchStatus: "matched" as const, promised, billed, received }] };
const rows = [
  { id: agreementId, type: "agreement", extraction_status: "complete", extracted: { status: "ready", facts: { source: promised.source, supplierName: null, promiseText: null, lines: [promised], uncertainties: [] } } },
  { id: invoiceId, type: "invoice", extraction_status: "complete", extracted: { status: "ready", facts: { source: billed.source, invoiceNumber: null, supplierName: null, lines: [billed], uncertainties: [] } } },
];

describe("case fact provenance", () => {
  it("accepts extracted commercial lines and authenticated merchant receiving form", () => {
    expect(() => verifyEvidenceSources(caseId, input, rows)).not.toThrow();
  });

  it("rejects a client-edited billed rate that differs from invoice extraction", () => {
    const changed = structuredClone(input);
    changed.groups[0].billed.unitPricePaise = 12500;
    expect(() => verifyEvidenceSources(caseId, changed, rows)).toThrow(/differs from stored source extraction/);
  });

  it("rejects receiving counts without merchant confirmation", () => {
    const changed = structuredClone(input);
    changed.groups[0].received.merchantConfirmed = false;
    expect(() => verifyEvidenceSources(caseId, changed, rows)).toThrow(/merchant confirmation/);
  });

  it("rejects commercial lines citing a different artifact type", () => {
    const changed = structuredClone(rows);
    changed[0].type = "invoice";
    expect(() => verifyEvidenceSources(caseId, input, changed)).toThrow(/agreement artifact/);
  });
});
