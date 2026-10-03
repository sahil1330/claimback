import { z } from "zod";
import { addPaise } from "../reconciliation/money";
import { discrepancySchema, type Discrepancy } from "../../types/domain";
import { getSupplierScenario, supplierScenarioIdSchema, type SupplierScenarioId, type SupplierScenarioStep } from "./scenarios";

const simulationInputSchema = z.object({
  scenarioId: supplierScenarioIdSchema,
  caseId: z.uuid(),
  claimMessageId: z.uuid(),
  priorInboundCount: z.number().int().nonnegative().safe(),
  discrepancies: z.array(discrepancySchema).min(1),
});

export type SupplierSimulationInput = z.input<typeof simulationInputSchema>;

export type SupplierResponseKind =
  | "partial_credit_promised"
  | "rate_credit_promised"
  | "full_credit_promised"
  | "rate_rejected"
  | "replacement_promised"
  | "unresolved";

export type SimulatedSupplierResponse = {
  scenarioId: SupplierScenarioId;
  body: string;
  source: "demo_supplier";
  responseKind: SupplierResponseKind;
};

const itemNames: Readonly<Record<Discrepancy["type"], string>> = {
  SHORT_DELIVERY: "short delivery",
  RATE_MISMATCH: "rate difference",
  MISSING_SCHEME_UNITS: "missing free units",
  DAMAGED_GOODS: "damaged goods",
};

const replacementNames: Readonly<Record<Discrepancy["type"], string>> = {
  SHORT_DELIVERY: "missing paid",
  RATE_MISMATCH: "rate difference",
  MISSING_SCHEME_UNITS: "missing free",
  DAMAGED_GOODS: "damaged",
};

function formatPaise(paise: number): string {
  const value = BigInt(paise);
  return `₹${value / BigInt(100)}.${(value % BigInt(100)).toString().padStart(2, "0")}`;
}

function totalPaise(items: readonly Discrepancy[]): number {
  return addPaise(...items.map((item) => item.amountPaise));
}

function itemDetails(items: readonly Discrepancy[]): string {
  return items.map((item) =>
    `${itemNames[item.type]} (${item.skuRef}): ${formatPaise(item.amountPaise)}`,
  ).join("; ");
}

function unresolved(body = "We are reviewing the claim. We cannot confirm a credit or replacement yet.") {
  return { body, responseKind: "unresolved" } as const;
}

function renderStep(step: SupplierScenarioStep, items: Discrepancy[]): Pick<SimulatedSupplierResponse, "body" | "responseKind"> {
  const rateItems = items.filter((item) => item.type === "RATE_MISMATCH");
  const physicalItems = items.filter((item) => item.type !== "RATE_MISMATCH");

  switch (step) {
    case "golden_partial_credit": {
      if (physicalItems.length === 0 || rateItems.length === 0) {
        return unresolved("We are reviewing the claim and cannot confirm any item yet.");
      }
      const creditPaise = totalPaise(physicalItems);
      return {
        responseKind: "partial_credit_promised",
        body: `We accept ${itemDetails(physicalItems)}. We will credit ${formatPaise(creditPaise)} on your next invoice. ` +
          `We do not accept ${itemDetails(rateItems)} at present; please share the original rate agreement.`,
      };
    }
    case "golden_rate_credit_promise": {
      if (physicalItems.length === 0 || rateItems.length === 0) {
        return unresolved("We are still reviewing the claim and cannot confirm the disputed rate yet.");
      }
      const rateCreditPaise = totalPaise(rateItems);
      const rateSource = rateItems[0].promisedEvidence.sourceLabel;
      return {
        responseKind: "rate_credit_promised",
        body: `After reviewing ${rateSource} from your claim, we now accept ${itemDetails(rateItems)}. ` +
          `We will credit the additional ${formatPaise(rateCreditPaise)} on your next invoice. ` +
          "This reply is a promise, not a credit note.",
      };
    }
    case "full_credit_promise": {
      const creditPaise = totalPaise(items);
      return {
        responseKind: "full_credit_promised",
        body: `We accept ${itemDetails(items)}. We will credit the full ${formatPaise(creditPaise)} on your next invoice.`,
      };
    }
    case "reject_rate":
      return rateItems.length > 0
        ? {
            responseKind: "rate_rejected",
            body: `We do not accept ${itemDetails(rateItems)}. The remaining claim items, if any, are still under review. No credit or replacement has been issued.`,
          }
        : unresolved("We are reviewing the claim. We cannot confirm the rate item because this claim contains no rate difference.");
    case "rate_follow_up":
      return unresolved("Our rate decision is unchanged. Any other claim items remain under review. No credit or replacement has been issued.");
    case "replacement_promise": {
      if (physicalItems.length === 0) {
        return unresolved("We are reviewing the claim. There are no missing or damaged units to replace in this claim.");
      }
      const units = physicalItems.map((item) => {
        const name = replacementNames[item.type];
        return `${item.affectedQuantity} ${name} unit${item.affectedQuantity === 1 ? "" : "s"} for ${item.skuRef}`;
      }).join("; ");
      return {
        responseKind: "replacement_promised",
        body: `We accept the physical delivery differences and will send replacements for ${units}. ` +
          "This is a promise; replacement has not been delivered yet." +
          (rateItems.length > 0 ? ` The rate difference (${itemDetails(rateItems)}) remains under review.` : ""),
      };
    }
    case "unresolved":
      return unresolved();
  }
}

/**
 * Return one scripted supplier reply for the recorded inbound count. The
 * caller persists responses; invoking this function twice with the same
 * count returns the same text. A null result means the supplier has no reply.
 */
export function simulateSupplierResponse(input: SupplierSimulationInput): SimulatedSupplierResponse | null {
  const parsed = simulationInputSchema.parse(input);
  const scenario = getSupplierScenario(parsed.scenarioId);
  const step = scenario.steps[parsed.priorInboundCount];
  if (!step) return null;
  const response = renderStep(step, parsed.discrepancies);
  return {
    scenarioId: scenario.id,
    body: response.body,
    source: "demo_supplier",
    responseKind: response.responseKind,
  };
}
