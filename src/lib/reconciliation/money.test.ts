import { describe, expect, it } from "vitest";

import {
  addPaise,
  damageValuePaise,
  multiplyPaise,
  rateMismatchValuePaise,
  shortDeliveryQuantity,
  shortDeliveryValuePaise,
} from "./money";

describe("integer-paise reconciliation helpers", () => {
  it("calculates shortage, rate mismatch, and damage exactly", () => {
    expect(shortDeliveryQuantity(50, 48)).toBe(2);
    expect(shortDeliveryValuePaise(50, 48, 10_000)).toBe(20_000);
    expect(rateMismatchValuePaise(42_800, 44_100, 20)).toBe(26_000);
    expect(damageValuePaise(2, 30_000)).toBe(60_000);
    expect(addPaise(20_000, 26_000, 60_000)).toBe(106_000);
  });

  it("does not create a negative claim for overdelivery or a lower billed rate", () => {
    expect(shortDeliveryValuePaise(48, 50, 10_000)).toBe(0);
    expect(rateMismatchValuePaise(44_100, 42_800, 20)).toBe(0);
  });

  it("rejects fractions, negative values, unsafe integers, and arithmetic overflow", () => {
    expect(() => addPaise(1.5)).toThrow(RangeError);
    expect(() => multiplyPaise(-1, 2)).toThrow(RangeError);
    expect(() => shortDeliveryQuantity(2, -1)).toThrow(RangeError);
    expect(() => damageValuePaise(Number.MAX_SAFE_INTEGER + 1, 1)).toThrow(RangeError);
    expect(() => multiplyPaise(Number.MAX_SAFE_INTEGER, 2)).toThrow(RangeError);
    expect(() => addPaise(Number.MAX_SAFE_INTEGER, 1)).toThrow(RangeError);
  });
});
