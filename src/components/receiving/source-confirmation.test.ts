import { describe, expect, it } from "vitest";
import { parseRupeesToPaise } from "./source-confirmation-values";

describe("merchant-confirmed source money", () => {
  it("converts displayed rupees to exact integer paise", () => {
    expect(parseRupeesToPaise("441")).toBe(44100);
    expect(parseRupeesToPaise(" 428.7 ")).toBe(42870);
    expect(parseRupeesToPaise("0.01")).toBe(1);
  });

  it("rejects imprecise or unsafe money inputs", () => {
    expect(parseRupeesToPaise("441.999")).toBeNull();
    expect(parseRupeesToPaise("-1")).toBeNull();
    expect(parseRupeesToPaise("99999999999999999999")).toBeNull();
  });
});
