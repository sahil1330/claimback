import { describe, expect, it } from "vitest";
import { buildEvidencePath } from "./evidence";

const user = "03394e16-c236-4ad1-99fb-38259e8238ad";
const caseId = "5d5dc89e-aeeb-4afe-9b2e-dde126e7cece";
const artifact = "74cf1e2f-58fd-486c-98f3-02db5b0030bb";

describe("evidence storage path", () => {
  it("keeps uploads inside the merchant and case folders", () => {
    expect(buildEvidencePath(user, caseId, artifact, "../../invoice.pdf"))
      .toBe(`${user}/${caseId}/${artifact}-invoice.pdf`);
  });

  it("rejects a forged non-UUID owner path", () => {
    expect(() => buildEvidencePath("../other-user", caseId, artifact, "invoice.pdf"))
      .toThrow();
  });
});
