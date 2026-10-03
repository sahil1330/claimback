import { describe, expect, it } from "vitest";
import { safeAuthRedirectPath } from "./redirect";

describe("auth callback destination", () => {
  it("keeps a local return path", () => {
    expect(safeAuthRedirectPath("/app/cases/123?tab=evidence"))
      .toBe("/app/cases/123?tab=evidence");
  });

  it.each([
    null,
    "https://example.com",
    "//example.com",
    "/\\example.com",
  ])("rejects an external destination: %s", (candidate) => {
    expect(safeAuthRedirectPath(candidate)).toBe("/app");
  });
});
