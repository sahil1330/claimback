import { afterEach, describe, expect, it, vi } from "vitest";
import type { Discrepancy } from "../../types/domain";

const mocks = vi.hoisted(() => ({ generateText: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("ai", () => ({
  generateText: mocks.generateText,
  Output: { object: vi.fn(() => ({})) },
}));

import { normalizeSupplierResponse, parseSupplierResponse } from "./supplier-response";

const messageId = "5d1fd034-e4b4-488d-a660-72a3f57b9153";
const evidence = {
  sourceArtifactId: "ab573f59-d382-44ba-a9d0-21b18a5fccda",
  sourceLabel: "Source",
  excerpt: "source line",
  locator: null,
};

function discrepancy(id: string, type: Discrepancy["type"], amountPaise: number): Discrepancy {
  return {
    id,
    type,
    skuRef: "MAGGI-70G",
    description: type,
    affectedQuantity: 2,
    expectedUnitPricePaise: 10000,
    billedUnitPricePaise: 10000,
    amountPaise,
    calculation: { kind: "short_delivery", inputs: { quantity: 2, unitPricePaise: 10000 } },
    promisedEvidence: evidence,
    billedEvidence: evidence,
    receivedEvidence: evidence,
    confidence: "high",
    status: "supported",
  };
}

const shortage = discrepancy("short-1", "SHORT_DELIVERY", 20000);
const rate = discrepancy("rate-1", "RATE_MISMATCH", 26000);

const initialKey = process.env.OPENAI_API_KEY;
const initialModel = process.env.OPENAI_EXTRACTION_MODEL;

afterEach(() => {
  if (initialKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = initialKey;
  if (initialModel === undefined) delete process.env.OPENAI_EXTRACTION_MODEL;
  else process.env.OPENAI_EXTRACTION_MODEL = initialModel;
  vi.clearAllMocks();
});

describe("supplier response interpretation", () => {
  it("separates a Hindi later-credit promise from a rejected rate difference", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_EXTRACTION_MODEL = "test-model";
    const body = "Shortage ₹200 approved, agle bill mein adjust kar denge. Rate difference not approved.";
    mocks.generateText.mockResolvedValueOnce({ output: {
      decisions: [
        {
          discrepancyId: "short-1", outcome: "promise_credit", scope: "full",
          sourceExcerpt: "Shortage ₹200 approved, agle bill mein adjust kar denge.",
          amountText: "₹200", promisedForText: "agle bill mein", uncertainty: null,
        },
        {
          discrepancyId: "rate-1", outcome: "rejected", scope: "full",
          sourceExcerpt: "Rate difference not approved.",
          amountText: null, promisedForText: null, uncertainty: null,
        },
      ],
      uncertainties: [],
    } });

    const result = await parseSupplierResponse({ messageId, body, discrepancies: [shortage, rate] });
    expect(result.sourceMessageId).toBe(messageId);
    expect(result.decisions).toEqual([
      {
        discrepancyId: "short-1", outcome: "promise_credit",
        sourceExcerpt: "Shortage ₹200 approved, agle bill mein adjust kar denge.",
        supplierAcknowledgedPaise: 20000, amountBasis: "explicit", coverage: "full",
        promisedForText: "agle bill mein", uncertainty: null,
      },
      {
        discrepancyId: "rate-1", outcome: "rejected",
        sourceExcerpt: "Rate difference not approved.",
        supplierAcknowledgedPaise: null, amountBasis: "none", coverage: "none",
        promisedForText: null, uncertainty: null,
      },
    ]);
    expect(result.needsConfirmation).toBe(false);
  });

  it("derives a full accepted component only from the persisted discrepancy", () => {
    const body = "Shortage accepted. Replacement on Friday.";
    const result = normalizeSupplierResponse({ messageId, body, discrepancies: [shortage] }, {
      decisions: [{
        discrepancyId: "short-1", outcome: "replacement", scope: "full",
        sourceExcerpt: body, amountText: null,
        promisedForText: "Friday", uncertainty: null,
      }],
      uncertainties: [],
    });
    expect(result.decisions[0]).toMatchObject({
      outcome: "replacement", supplierAcknowledgedPaise: 20000,
      amountBasis: "full_discrepancy", coverage: "full",
    });
  });

  it("keeps an unquantified partial promise unresolved", () => {
    const body = "We will credit half the shortage next invoice.";
    const result = normalizeSupplierResponse({ messageId, body, discrepancies: [shortage] }, {
      decisions: [{
        discrepancyId: "short-1", outcome: "promise_credit", scope: "partial",
        sourceExcerpt: body, amountText: null, promisedForText: "next invoice", uncertainty: null,
      }], uncertainties: [],
    });
    expect(result.decisions[0]).toMatchObject({ outcome: "unresolved", supplierAcknowledgedPaise: null });
    expect(result.needsConfirmation).toBe(true);
  });

  it("accepts an explicit partial amount without letting the model increase the claim", () => {
    const body = "₹100 shortage credit next invoice.";
    const raw = {
      decisions: [{
        discrepancyId: "short-1", outcome: "promise_credit", scope: "partial",
        sourceExcerpt: body, amountText: "₹100", promisedForText: "next invoice", uncertainty: null,
      }], uncertainties: [],
    };
    expect(normalizeSupplierResponse({ messageId, body, discrepancies: [shortage] }, raw)
      .decisions[0]).toMatchObject({ supplierAcknowledgedPaise: 10000, coverage: "partial" });
    raw.decisions[0].amountText = "₹300";
    raw.decisions[0].sourceExcerpt = "₹300 shortage credit next invoice.";
    const oversized = normalizeSupplierResponse({ messageId, body: raw.decisions[0].sourceExcerpt, discrepancies: [shortage] }, raw);
    expect(oversized.decisions[0]).toMatchObject({ outcome: "unresolved", supplierAcknowledgedPaise: null });
    expect(oversized.needsConfirmation).toBe(true);
  });

  it("rejects fabricated quotes and unknown or duplicate IDs", () => {
    const body = "We will review it.";
    const result = normalizeSupplierResponse({ messageId, body, discrepancies: [shortage, rate] }, {
      decisions: [
        {
          discrepancyId: "short-1", outcome: "accepted", scope: "full",
          sourceExcerpt: "Shortage accepted.", amountText: null, promisedForText: null, uncertainty: null,
        },
        {
          discrepancyId: "rate-1", outcome: "rejected", scope: "full",
          sourceExcerpt: body, amountText: null, promisedForText: null, uncertainty: null,
        },
        {
          discrepancyId: "rate-1", outcome: "accepted", scope: "full",
          sourceExcerpt: body, amountText: null, promisedForText: null, uncertainty: null,
        },
        {
          discrepancyId: "other", outcome: "accepted", scope: "full",
          sourceExcerpt: body, amountText: null, promisedForText: null, uncertainty: null,
        },
      ],
      uncertainties: [],
    });
    expect(result.decisions.map((item) => item.outcome)).toEqual(["unresolved", "unresolved"]);
    expect(result.uncertainties.some((item) => item.includes("unknown discrepancy ID"))).toBe(true);
  });

  it("does not mistake a per-unit rate for an accepted total", () => {
    const body = "We agree ₹100 per box for shortage.";
    const result = normalizeSupplierResponse({ messageId, body, discrepancies: [shortage] }, {
      decisions: [{
        discrepancyId: "short-1", outcome: "accepted", scope: "partial",
        sourceExcerpt: body, amountText: "₹100 per box", promisedForText: null, uncertainty: null,
      }], uncertainties: [],
    });
    expect(result.decisions[0]).toMatchObject({ outcome: "unresolved", supplierAcknowledgedPaise: null });
  });
});
