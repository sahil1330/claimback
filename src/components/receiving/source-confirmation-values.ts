/** Parse merchant-entered rupees exactly, without floating-point money conversion. */
export function parseRupeesToPaise(value: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const paise = BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0") || "0");
  return paise <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(paise) : null;
}
