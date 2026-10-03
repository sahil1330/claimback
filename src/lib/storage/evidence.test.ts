import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  requireMerchant: vi.fn(),
  assertCaseOwnership: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../auth/session", () => ({ requireMerchant: authMocks.requireMerchant }));
vi.mock("../auth/case-access", () => ({ assertCaseOwnership: authMocks.assertCaseOwnership }));

import {
  buildEvidencePath,
  downloadEvidence,
  EvidenceNotFoundError,
  EvidenceStorageError,
  uploadEvidence,
} from "./evidence";

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

describe("authenticated evidence storage", () => {
  const bucket = {
    upload: vi.fn(),
    download: vi.fn(),
    remove: vi.fn(),
  };
  const artifactQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
    insert: vi.fn(),
  };
  const supabase = {
    storage: { from: vi.fn(() => bucket) },
    from: vi.fn(() => artifactQuery),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.requireMerchant.mockResolvedValue({ supabase, userId: user });
    authMocks.assertCaseOwnership.mockResolvedValue({ id: caseId, user_id: user });
    bucket.upload.mockResolvedValue({ error: null });
    bucket.remove.mockResolvedValue({ error: null });
    artifactQuery.insert.mockResolvedValue({ error: null });
  });

  it("checks case ownership before placing an evidence file", async () => {
    authMocks.assertCaseOwnership.mockRejectedValueOnce(new Error("Access denied"));
    const file = new File(["hello"], "invoice.txt", { type: "text/plain" });

    await expect(uploadEvidence({ caseId, type: "invoice", file }))
      .rejects.toThrow("Access denied");
    expect(bucket.upload).not.toHaveBeenCalled();
    expect(artifactQuery.insert).not.toHaveBeenCalled();
  });

  it("uploads to the private merchant path and registers the artifact", async () => {
    const file = new File(["hello"], "../agreement.txt", { type: "text/plain" });

    const result = await uploadEvidence({ caseId, type: "agreement", file });

    expect(supabase.storage.from).toHaveBeenCalledWith("claimback-evidence");
    expect(bucket.upload).toHaveBeenCalledWith(
      `${user}/${caseId}/${result.artifactId}-agreement.txt`,
      file,
      { contentType: "text/plain", upsert: false },
    );
    expect(artifactQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      id: result.artifactId,
      user_id: user,
      case_id: caseId,
      type: "agreement",
      original_name: "agreement.txt",
    }));
    expect(result.label).toBe("agreement.txt");
  });

  it("removes an uploaded object if the artifact row cannot be saved", async () => {
    artifactQuery.insert.mockResolvedValueOnce({ error: new Error("insert failed") });
    const file = new File(["hello"], "invoice.txt", { type: "text/plain" });

    await expect(uploadEvidence({ caseId, type: "invoice", file }))
      .rejects.toBeInstanceOf(EvidenceStorageError);
    expect(bucket.remove).toHaveBeenCalledWith([
      expect.stringMatching(new RegExp(`^${user}/${caseId}/[a-f0-9-]+-invoice\\.txt$`)),
    ]);
  });

  it("rejects unsupported or oversized files before storage access", async () => {
    await expect(uploadEvidence({
      caseId,
      type: "invoice",
      file: new File(["x"], "script.js", { type: "text/javascript" }),
    })).rejects.toBeInstanceOf(EvidenceStorageError);
    await expect(uploadEvidence({
      caseId,
      type: "invoice",
      file: new File([new Uint8Array(10 * 1024 * 1024 + 1)], "huge.pdf", { type: "application/pdf" }),
    })).rejects.toBeInstanceOf(EvidenceStorageError);
    expect(bucket.upload).not.toHaveBeenCalled();
  });

  it("downloads registered plain text evidence with bytes and decoded text", async () => {
    artifactQuery.maybeSingle.mockResolvedValueOnce({
      data: {
        id: artifact,
        user_id: user,
        case_id: caseId,
        type: "agreement",
        storage_path: `${user}/${caseId}/${artifact}-agreement.txt`,
        mime_type: "text/plain",
        original_name: "agreement.txt",
      },
      error: null,
    });
    bucket.download.mockResolvedValueOnce({
      data: new Blob(["50 boxes, 10+1"], { type: "text/plain" }),
      error: null,
    });

    const result = await downloadEvidence({ caseId, artifactId: artifact });

    expect(authMocks.assertCaseOwnership).toHaveBeenCalledWith(supabase, caseId, user);
    expect(artifactQuery.eq).toHaveBeenCalledWith("user_id", user);
    expect(bucket.download).toHaveBeenCalledWith(`${user}/${caseId}/${artifact}-agreement.txt`);
    expect(result.text).toBe("50 boxes, 10+1");
    expect(result.bytes).toEqual(new TextEncoder().encode("50 boxes, 10+1"));
    expect(result.label).toBe("agreement.txt");
  });

  it("checks case ownership before looking up or downloading evidence", async () => {
    authMocks.assertCaseOwnership.mockRejectedValueOnce(new Error("Access denied"));

    await expect(downloadEvidence({ caseId, artifactId: artifact }))
      .rejects.toThrow("Access denied");
    expect(artifactQuery.select).not.toHaveBeenCalled();
    expect(bucket.download).not.toHaveBeenCalled();
  });

  it("never downloads a record whose storage path escapes its case", async () => {
    artifactQuery.maybeSingle.mockResolvedValueOnce({
      data: {
        id: artifact,
        user_id: user,
        case_id: caseId,
        type: "invoice",
        storage_path: `${user}/92706837-0dcc-49b1-b206-aac78136b1a1/${artifact}-invoice.pdf`,
        mime_type: "application/pdf",
        original_name: "invoice.pdf",
      },
      error: null,
    });

    await expect(downloadEvidence({ caseId, artifactId: artifact }))
      .rejects.toBeInstanceOf(EvidenceNotFoundError);
    expect(bucket.download).not.toHaveBeenCalled();
  });

  it("refuses to serve an unapproved MIME type from artifact metadata", async () => {
    artifactQuery.maybeSingle.mockResolvedValueOnce({
      data: {
        id: artifact,
        user_id: user,
        case_id: caseId,
        type: "invoice",
        storage_path: `${user}/${caseId}/${artifact}-invoice.html`,
        mime_type: "text/html",
        original_name: "invoice.html",
      },
      error: null,
    });
    bucket.download.mockResolvedValueOnce({
      data: new Blob(["<script>alert(1)</script>"], { type: "text/html" }),
      error: null,
    });

    await expect(downloadEvidence({ caseId, artifactId: artifact }))
      .rejects.toBeInstanceOf(EvidenceStorageError);
  });
});
