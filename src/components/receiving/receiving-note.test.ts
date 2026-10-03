import { describe, expect, it } from "vitest";
import { appendReceivingUpdate } from "./receiving-note";

describe("receiving chat corrections", () => {
  it("keeps the original count and the later corrected damage count for extraction", () => {
    const initial = "50 बॉक्स मंगाए, 48 आए, 2 डैमेज थे";
    const note = appendReceivingUpdate(initial, "पैकेट नहीं, बॉक्स; 3 फटे हुए थे");
    expect(note).toContain("50 बॉक्स मंगाए, 48 आए");
    expect(note).toContain("Later merchant clarification: पैकेट नहीं, बॉक्स; 3 फटे हुए थे");
    expect(note.indexOf("Later merchant clarification")).toBeGreaterThan(note.indexOf("48 आए"));
  });

  it("starts with the merchant's first description", () => {
    expect(appendReceivingUpdate("", "48 boxes came, 3 damaged")).toBe("48 boxes came, 3 damaged");
  });
});
