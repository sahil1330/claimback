/** Convert a printed rupee amount to integer paise without floating point. */
export function parsePrintedRupees(value: string | null): number | null {
  if (value === null) return null;
  const printed = value.trim().replace(/^(?:₹|Rs\.?|INR)\s*/i, "");
  const match = /^((?:\d+|\d{1,3}(?:,\d{3})+|\d{1,3}(?:,\d{2})+,\d{3}))(?:\.(\d{1,2}))?(?:\s*(?:per|\/)\s*[\p{L}]+)?$/iu.exec(printed);
  if (!match) return null;
  const paise = BigInt(match[1].replace(/,/g, "")) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0") || "0");
  return paise <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(paise) : null;
}
