import type { BilledLine, PromisedLine, ReceivedLine } from "../../types/domain";
import { matchSku, type SkuCandidateInput, type SkuMatchResult } from "./sku-match";

/** Keep match uncertainty next to the source line so UI can request confirmation. */
export function matchFactLines(
  lines: readonly (BilledLine | PromisedLine | ReceivedLine)[],
  candidates: readonly SkuCandidateInput[],
): Array<{ line: BilledLine | PromisedLine | ReceivedLine; resolution: SkuMatchResult }> {
  return lines.map((line) => ({
    line,
    resolution: matchSku(
      { rawName: line.rawName, skuCode: line.skuRef, unit: line.unit, packSize: line.packSize },
      candidates,
    ),
  }));
}
