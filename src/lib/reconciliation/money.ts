/** Money stays in integer paise throughout reconciliation. */
export function assertNonNegativeSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

function safeNumber(value: bigint, name: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${name} exceeds the safe integer range`);
  }

  return Number(value);
}

export function addPaise(...amountsPaise: number[]): number {
  let total = BigInt(0);

  for (const amountPaise of amountsPaise) {
    assertNonNegativeSafeInteger(amountPaise, "amountPaise");
    total += BigInt(amountPaise);
  }

  return safeNumber(total, "Total paise");
}

export function multiplyPaise(unitPricePaise: number, quantity: number): number {
  assertNonNegativeSafeInteger(unitPricePaise, "unitPricePaise");
  assertNonNegativeSafeInteger(quantity, "quantity");

  return safeNumber(BigInt(unitPricePaise) * BigInt(quantity), "Line value paise");
}

export function shortDeliveryQuantity(expectedQuantity: number, receivedQuantity: number): number {
  assertNonNegativeSafeInteger(expectedQuantity, "expectedQuantity");
  assertNonNegativeSafeInteger(receivedQuantity, "receivedQuantity");

  return Math.max(0, expectedQuantity - receivedQuantity);
}

export function shortDeliveryValuePaise(
  expectedQuantity: number,
  receivedQuantity: number,
  unitPricePaise: number,
): number {
  return multiplyPaise(
    unitPricePaise,
    shortDeliveryQuantity(expectedQuantity, receivedQuantity),
  );
}

export function rateMismatchValuePaise(
  promisedUnitPricePaise: number,
  billedUnitPricePaise: number,
  billedQuantity: number,
): number {
  assertNonNegativeSafeInteger(promisedUnitPricePaise, "promisedUnitPricePaise");
  assertNonNegativeSafeInteger(billedUnitPricePaise, "billedUnitPricePaise");

  return multiplyPaise(
    Math.max(0, billedUnitPricePaise - promisedUnitPricePaise),
    billedQuantity,
  );
}

export function damageValuePaise(damagedQuantity: number, referenceUnitPricePaise: number): number {
  return multiplyPaise(referenceUnitPricePaise, damagedQuantity);
}
