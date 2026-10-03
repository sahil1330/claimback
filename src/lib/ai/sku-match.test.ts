import { describe, expect, it } from "vitest";
import { matchSku, normalizeSkuName } from "./sku-match";

describe("SKU candidate matching", () => {
  it("matches a unique product with equivalent pack notation and unit spelling", () => {
    const result = matchSku(
      { rawName: "Masala Maggi 70 g × 96", unit: "boxes" },
      [{ id: "maggi-70", rawName: "MAGGI MASALA 70GX96", unit: "box" }],
    );

    expect(normalizeSkuName("MAGGI MASALA 70GX96")).toBe("maggi masala");
    expect(result.status).toBe("matched");
    expect(result.match?.candidate.id).toBe("maggi-70");
    expect(result.match?.reasons).toContain("pack_exact");
    expect(result.match?.reasons).toContain("unit_exact");
  });

  it("asks for confirmation when the name could refer to different packs (T19)", () => {
    const result = matchSku(
      { rawName: "Maggi Masala" },
      [
        { id: "maggi-70", rawName: "MAGGI MASALA 70G" },
        { id: "maggi-100", rawName: "MAGGI MASALA 100G" },
      ],
    );

    expect(result.status).toBe("ambiguous");
    expect(result.match).toBeNull();
    expect(result.candidates.map(({ candidate }) => candidate.id)).toEqual([
      "maggi-100",
      "maggi-70",
    ]);
    expect(result.candidates.every(({ reasons }) =>
      reasons.includes("pack_missing"))).toBe(true);
  });

  it("keeps one product with missing pack detail ambiguous", () => {
    const result = matchSku(
      { rawName: "Maggi Masala 70G" },
      [{ id: "maggi", rawName: "Maggi Masala" }],
    );

    expect(result.status).toBe("ambiguous");
    expect(result.match).toBeNull();
  });

  it("uses an explicit pack to distinguish otherwise identical products", () => {
    const result = matchSku(
      { rawName: "Maggi Masala 70g" },
      [
        { id: "maggi-70", rawName: "Maggi Masala 70 g" },
        { id: "maggi-100", rawName: "Maggi Masala 100 g" },
      ],
    );

    expect(result.status).toBe("matched");
    expect(result.match?.candidate.id).toBe("maggi-70");
    expect(result.candidates[1].reasons).toContain("pack_conflict");
  });

  it("never silently selects two records with the same identity", () => {
    const result = matchSku(
      { rawName: "Parle G 100g", skuCode: "PG100" },
      [
        { id: "first", rawName: "Parle G 100g", skuCode: "PG100" },
        { id: "second", rawName: "Parle G 100g", skuCode: "PG100" },
      ],
    );

    expect(result.status).toBe("ambiguous");
    expect(result.match).toBeNull();
  });

  it("lets an exact SKU code disambiguate a partially named product", () => {
    const result = matchSku(
      { rawName: "Maggi", skuCode: "MAG-70" },
      [
        { id: "masala", rawName: "Maggi Masala", skuCode: "MAG-70" },
        { id: "chicken", rawName: "Maggi Chicken", skuCode: "MAG-80" },
      ],
    );

    expect(result.status).toBe("matched");
    expect(result.match?.candidate.id).toBe("masala");
    expect(result.candidates[1].reasons).toContain("sku_code_conflict");
  });

  it("requires confirmation when the source code is absent from the candidate", () => {
    const result = matchSku(
      { rawName: "Maggi Masala 70g", skuCode: "MAG-70" },
      [{ id: "maggi", rawName: "Maggi Masala 70g" }],
    );
    expect(result.status).toBe("ambiguous");
    expect(result.candidates[0].reasons).toContain("sku_code_missing");
  });

  it("rejects conflicting product pack, quantity unit, and SKU code", () => {
    const candidates = [
      { id: "pack", rawName: "Soap 200g", unit: "box", skuCode: "SOAP-200" },
    ];

    const wrongPack = matchSku(
      { rawName: "Soap 100g", unit: "box", skuCode: "SOAP-200" },
      candidates,
    );
    expect(wrongPack.status).toBe("unmatched");
    expect(wrongPack.candidates[0].reasons).toContain("pack_conflict");

    const wrongUnit = matchSku(
      { rawName: "Soap 200g", unit: "peti", skuCode: "SOAP-200" },
      candidates,
    );
    expect(wrongUnit.status).toBe("unmatched");
    expect(wrongUnit.candidates[0].reasons).toContain("unit_conflict");

    const wrongCode = matchSku(
      { rawName: "Soap 200g", unit: "box", skuCode: "SOAP200" },
      candidates,
    );
    expect(wrongCode.status).toBe("unmatched");
    expect(wrongCode.candidates[0].reasons).toContain("sku_code_conflict");
  });

  it("does not match unrelated product names", () => {
    const result = matchSku(
      { rawName: "Parle G" },
      [{ id: "maggi", rawName: "Maggi Masala" }],
    );

    expect(result.status).toBe("unmatched");
    expect(result.candidates[0].strength).toBe("blocked");
    expect(result.candidates[0].reasons).toContain("name_no_overlap");
  });

  it("returns ranked candidates without changing the source order", () => {
    const candidates = [
      { id: "partial", rawName: "Maggi Chicken" },
      { id: "exact", rawName: "Maggi Masala" },
    ];
    const result = matchSku({ rawName: "Maggi Masala" }, candidates);

    expect(result.status).toBe("matched");
    expect(result.candidates.map(({ candidate }) => candidate.id)).toEqual([
      "exact",
      "partial",
    ]);
    expect(candidates.map(({ id }) => id)).toEqual(["partial", "exact"]);
    expect(result.candidates[0].score).toBeGreaterThan(result.candidates[1].score);
  });
});
