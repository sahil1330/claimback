import { confirmReceivingInput } from "../../lib/ai/normalize";
import { matchFactLines } from "../../lib/ai/match-facts";
import { matchSku } from "../../lib/ai/sku-match";
import type { ReconciliationInput } from "../../lib/reconciliation/engine";
import type { AgreementFacts, BilledLine, InvoiceFacts, PromisedLine } from "../../types/domain";

export type ReceivingDraft = {
  promisedIndex: number | null;
  matchConfirmed: boolean;
  paid: string;
  free: string;
  damaged: string;
};

function skuInput(line: BilledLine | PromisedLine) {
  return { rawName: line.rawName, skuCode: line.skuRef, unit: line.unit, packSize: line.packSize };
}

export function initialReceivingDrafts(invoice: InvoiceFacts, agreement: AgreementFacts): ReceivingDraft[] {
  const candidates = agreement.lines.map((line, index) => ({ id: String(index), ...skuInput(line) }));
  return matchFactLines(invoice.lines, candidates).map(({ resolution }) => ({
    promisedIndex: resolution.status === "matched" ? Number(resolution.match.candidate.id) : null,
    matchConfirmed: false,
    paid: "",
    free: "",
    damaged: "",
  }));
}

function count(value: string, label: string): number {
  if (!/^\d+$/.test(value.trim())) throw new Error(`Enter a whole-number ${label}`);
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error(`${label} is too large`);
  return number;
}

function sourceReady(line: BilledLine | PromisedLine) {
  return line.confidence === "high" && line.uncertainties.length === 0 &&
    Boolean(line.source.excerpt || line.source.locator) &&
    line.quantity !== null && line.unitPricePaise !== null;
}

/** Assemble merchant-confirmed inputs. A-owned reconciliation calculates the result. */
export function prepareCaseFacts(
  caseId: string,
  invoice: InvoiceFacts,
  agreement: AgreementFacts,
  drafts: ReceivingDraft[],
): ReconciliationInput {
  if (!invoice.lines.length || drafts.length !== invoice.lines.length) {
    throw new Error("Extract an invoice with product lines first");
  }
  const selected = new Set<number>();
  const matched = drafts.map((draft, index) => {
    const billed = invoice.lines[index];
    const promised = draft.promisedIndex === null ? null : agreement.lines[draft.promisedIndex];
    if (!promised) throw new Error(`Choose the supplier promise for ${billed.rawName}`);
    if (selected.has(draft.promisedIndex!)) throw new Error("Each promised product can match only one invoice line");
    selected.add(draft.promisedIndex!);
    if (!sourceReady(billed) || !sourceReady(promised)) {
      throw new Error(`Use clearer evidence for ${billed.rawName}; a source fact remains uncertain`);
    }
    const safeMatch = matchSku(skuInput(promised), [{ id: "billed", ...skuInput(billed) }]).status === "matched";
    if (!safeMatch && !draft.matchConfirmed) {
      throw new Error(`Confirm that ${billed.rawName} matches the selected supplier promise`);
    }
    const paid = count(draft.paid, `received paid quantity for ${billed.rawName}`);
    const damaged = count(draft.damaged, `damaged quantity for ${billed.rawName}`);
    if (damaged > paid) throw new Error(`Damaged units exceed received units for ${billed.rawName}`);
    const free = draft.free.trim() === "" ? null : count(draft.free, `received free quantity for ${billed.rawName}`);
    if (promised.scheme && free === null) {
      throw new Error(`Confirm received free scheme units for ${billed.rawName}, including zero`);
    }
    return { billed, promised, safeMatch, paid, free, damaged };
  });

  const receiving = confirmReceivingInput({
    source: {
      sourceArtifactId: caseId,
      sourceLabel: "Merchant-confirmed receiving input",
      excerpt: null,
      locator: "receive-stock-form",
    },
    lines: matched.map(({ billed, paid, free, damaged }) => ({
      rawName: billed.rawName,
      skuRef: billed.skuRef,
      unit: billed.unit,
      packSize: billed.packSize,
      receivedQuantity: paid,
      receivedFreeQuantity: free,
      damagedQuantity: damaged,
    })),
  });

  return {
    groups: matched.map(({ billed, promised, safeMatch }, index) => ({
      skuRef: billed.skuRef || promised.skuRef || billed.rawName,
      matchStatus: safeMatch ? "matched" : "merchant_confirmed",
      billed,
      promised,
      received: receiving.lines[index],
    })),
  };
}
