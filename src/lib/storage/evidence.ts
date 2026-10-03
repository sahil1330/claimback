import { z } from "zod";

const evidenceIdSchema = z.uuid();

export const EVIDENCE_BUCKET = "claimback-evidence";

export function buildEvidencePath(
  userId: string,
  caseId: string,
  artifactId: string,
  originalName: string,
): string {
  evidenceIdSchema.parse(userId);
  evidenceIdSchema.parse(caseId);
  evidenceIdSchema.parse(artifactId);

  const baseName = originalName.split(/[\\/]/).pop() ?? "";
  const safeName = baseName
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 120) || "evidence";

  return `${userId}/${caseId}/${artifactId}-${safeName}`;
}
