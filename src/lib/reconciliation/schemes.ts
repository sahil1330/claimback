import { assertNonNegativeSafeInteger } from "./money";

/** A buy-N-get-M entitlement is based on complete paid groups only. */
export function expectedFreeQuantity(
  paidQuantity: number,
  buyQuantity: number,
  freeQuantity: number,
): number {
  assertNonNegativeSafeInteger(paidQuantity, "paidQuantity");
  assertNonNegativeSafeInteger(buyQuantity, "buyQuantity");
  assertNonNegativeSafeInteger(freeQuantity, "freeQuantity");

  if (buyQuantity === 0 || freeQuantity === 0) {
    throw new RangeError("Scheme buyQuantity and freeQuantity must be positive");
  }

  const entitled = (BigInt(paidQuantity) / BigInt(buyQuantity)) * BigInt(freeQuantity);
  if (entitled > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("Scheme entitlement exceeds the safe integer range");
  }

  return Number(entitled);
}

export function missingFreeQuantity(expectedQuantity: number, receivedFreeQuantity: number): number {
  assertNonNegativeSafeInteger(expectedQuantity, "expectedQuantity");
  assertNonNegativeSafeInteger(receivedFreeQuantity, "receivedFreeQuantity");

  return Math.max(0, expectedQuantity - receivedFreeQuantity);
}
