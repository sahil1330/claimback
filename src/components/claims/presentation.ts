import type { Discrepancy, SourceEvidence } from "../../types/domain";
import { formatPaise } from "../dashboard/metrics";

function money(paise: number): string {
  return formatPaise(BigInt(paise));
}

function quantity(value: number): string {
  return value.toLocaleString("en-IN");
}

/** Display the deterministic inputs and answer without recalculating a claim. */
export function presentDiscrepancy(item: Discrepancy) {
  const input = item.calculation.inputs;
  const amount = money(item.amountPaise);

  switch (item.calculation.kind) {
    case "short_delivery":
      return {
        title: "Short delivery",
        promised: `Agreed rate ${money(item.expectedUnitPricePaise)}`,
        billed: `${quantity(input.billedQuantity)} paid units at ${money(input.billedUnitPricePaise)}`,
        received: `${quantity(input.receivedQuantity)} paid units counted`,
        formula: `${quantity(input.billedQuantity)} billed − ${quantity(input.receivedQuantity)} received = ${quantity(input.missingQuantity)} missing; ${quantity(input.missingQuantity)} × ${money(input.billedUnitPricePaise)} = ${amount}`,
      };
    case "rate_mismatch":
      return {
        title: "Rate mismatch",
        promised: `Agreed rate ${money(input.agreedUnitPricePaise)}`,
        billed: `Billed rate ${money(input.billedUnitPricePaise)}`,
        received: `${quantity(input.saleableReceivedQuantity)} saleable paid units`,
        formula: `${quantity(input.saleableReceivedQuantity)} saleable units × (${money(input.billedUnitPricePaise)} billed − ${money(input.agreedUnitPricePaise)} agreed) = ${amount}`,
      };
    case "missing_scheme_units":
      return {
        title: "Missing free units",
        promised: `${quantity(input.buyQuantity)}+${quantity(input.freeQuantity)} scheme; ${quantity(input.expectedFreeQuantity)} free units due`,
        billed: `${quantity(input.paidQuantity)} paid units`,
        received: `${quantity(input.receivedFreeQuantity)} free units counted`,
        formula: `${quantity(input.expectedFreeQuantity)} due − ${quantity(input.receivedFreeQuantity)} received = ${quantity(input.missingFreeQuantity)} missing; ${quantity(input.missingFreeQuantity)} × ${money(input.agreedUnitPricePaise)} = ${amount}`,
      };
    case "damaged_goods":
      return {
        title: "Damaged goods",
        promised: `Agreed rate ${money(item.expectedUnitPricePaise)}`,
        billed: `Billed rate ${money(input.billedUnitPricePaise)}`,
        received: `${quantity(input.damagedQuantity)} damaged paid units`,
        formula: `${quantity(input.damagedQuantity)} damaged × ${money(input.billedUnitPricePaise)} = ${amount}`,
      };
  }
}

export function evidenceHref(caseId: string, source: SourceEvidence): string | null {
  if (source.sourceArtifactId === caseId) return null;
  const query = new URLSearchParams({ caseId, artifactId: source.sourceArtifactId });
  return `/api/evidence?${query.toString()}`;
}
