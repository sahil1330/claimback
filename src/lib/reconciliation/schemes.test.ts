import { describe, expect, it } from "vitest";

import { expectedFreeQuantity, missingFreeQuantity } from "./schemes";

describe("buy-N-get-M scheme arithmetic", () => {
  it("counts complete paid groups and missing free units", () => {
    expect(expectedFreeQuantity(50, 10, 1)).toBe(5);
    expect(missingFreeQuantity(5, 3)).toBe(2);
    expect(expectedFreeQuantity(19, 10, 2)).toBe(2);
    expect(expectedFreeQuantity(9, 10, 1)).toBe(0);
    expect(missingFreeQuantity(5, 6)).toBe(0);
  });

  it("rejects invalid terms and entitlement overflow", () => {
    expect(() => expectedFreeQuantity(50, 0, 1)).toThrow(RangeError);
    expect(() => expectedFreeQuantity(50, 10, 0)).toThrow(RangeError);
    expect(() => expectedFreeQuantity(50.5, 10, 1)).toThrow(RangeError);
    expect(() => missingFreeQuantity(5, -1)).toThrow(RangeError);
    expect(() => expectedFreeQuantity(Number.MAX_SAFE_INTEGER, 1, 2)).toThrow(RangeError);
  });
});
