import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { assertCaseOwnership } from "../auth/case-access";
import { requireMerchant } from "../auth/session";

const evidenceIdSchema = z.uuid();
const evidenceTypeSchema = z.enum([
  "invoice",
  "agreement",
  "receiving_photo",
  "damage_photo",
  "credit_note",
  "corrected_invoice",
  "other",
]);

const artifactRowSchema = z.object({
  id: evidenceIdSchema,
  user_id: evidenceIdSchema,
  case_id: evidenceIdSchema,
  type: evidenceTypeSchema,
  storage_path: z.string().min(1),
  mime_type: z.string().nullable(),
  original_name: z.string().nullable(),
});

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
]);
const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

export const EVIDENCE_BUCKET = "claimback-evidence";
export type EvidenceType = z.infer<typeof evidenceTypeSchema>;

export interface EvidenceArtifact {
  artifactId: string;
  caseId: string;
  type: EvidenceType;
  label: string;
  mimeType: string;
  originalName: string;
  storagePath: string;
}

export interface DownloadedEvidence extends Omit<EvidenceArtifact, "storagePath"> {
  bytes: Uint8Array;
  text?: string;
}

export class EvidenceStorageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "EvidenceStorageError";
  }
}

export class EvidenceNotFoundError extends Error {
  constructor() {
    super("Evidence not found or access denied");
    this.name = "EvidenceNotFoundError";
  }
}

function safeOriginalName(originalName: string): string {
  const baseName = originalName.split(/[\\/]/).pop() ?? "";
  return baseName.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 255) || "evidence";
}

function checkedMimeType(file: File): string {
  const mimeType = file.type.toLowerCase().split(";", 1)[0];
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new EvidenceStorageError("Use a PDF, image, or plain text evidence file");
  }
  if (file.size === 0 || file.size > MAX_EVIDENCE_BYTES) {
    throw new EvidenceStorageError("Evidence file must be between 1 byte and 10 MB");
  }
  return mimeType;
}

export function buildEvidencePath(
  userId: string,
  caseId: string,
  artifactId: string,
  originalName: string,
): string {
  evidenceIdSchema.parse(userId);
  evidenceIdSchema.parse(caseId);
  evidenceIdSchema.parse(artifactId);

  const safeName = safeOriginalName(originalName)
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 120) || "evidence";

  return `${userId}/${caseId}/${artifactId}-${safeName}`;
}

/** Upload evidence with the merchant session, then register its metadata. */
export async function uploadEvidence(input: {
  caseId: string;
  type: EvidenceType;
  file: File;
}): Promise<EvidenceArtifact> {
  const caseId = evidenceIdSchema.parse(input.caseId);
  const type = evidenceTypeSchema.parse(input.type);
  const mimeType = checkedMimeType(input.file);
  const originalName = safeOriginalName(input.file.name);
  const { supabase, userId } = await requireMerchant();
  evidenceIdSchema.parse(userId);
  await assertCaseOwnership(supabase, caseId, userId);

  const artifactId = randomUUID();
  const storagePath = buildEvidencePath(userId, caseId, artifactId, originalName);
  const bucket = supabase.storage.from(EVIDENCE_BUCKET);
  const { error: uploadError } = await bucket.upload(storagePath, input.file, {
    contentType: mimeType,
    upsert: false,
  });
  if (uploadError) {
    throw new EvidenceStorageError("Evidence upload failed", { cause: uploadError });
  }

  const { error: metadataError } = await supabase.from("artifacts").insert({
    id: artifactId,
    user_id: userId,
    case_id: caseId,
    type,
    storage_path: storagePath,
    mime_type: mimeType,
    original_name: originalName,
  });
  if (metadataError) {
    await bucket.remove([storagePath]);
    throw new EvidenceStorageError("Evidence metadata could not be saved", {
      cause: metadataError,
    });
  }

  return {
    artifactId,
    caseId,
    type,
    label: originalName,
    mimeType,
    originalName,
    storagePath,
  };
}

/** Read only a registered artifact belonging to the signed-in merchant's case. */
export async function downloadEvidence(input: {
  caseId: string;
  artifactId: string;
}): Promise<DownloadedEvidence> {
  const caseId = evidenceIdSchema.parse(input.caseId);
  const artifactId = evidenceIdSchema.parse(input.artifactId);
  const { supabase, userId } = await requireMerchant();
  evidenceIdSchema.parse(userId);
  await assertCaseOwnership(supabase, caseId, userId);

  const { data: unparsedRow, error: lookupError } = await supabase
    .from("artifacts")
    .select("id, user_id, case_id, type, storage_path, mime_type, original_name")
    .eq("id", artifactId)
    .eq("case_id", caseId)
    .eq("user_id", userId)
    .maybeSingle();
  if (lookupError) {
    throw new EvidenceStorageError("Evidence lookup failed", { cause: lookupError });
  }
  if (!unparsedRow) {
    throw new EvidenceNotFoundError();
  }

  const row = artifactRowSchema.parse(unparsedRow);
  if (
    row.user_id !== userId ||
    row.case_id !== caseId ||
    row.id !== artifactId ||
    !row.storage_path.startsWith(`${userId}/${caseId}/${artifactId}-`)
  ) {
    throw new EvidenceNotFoundError();
  }

  const { data: file, error: downloadError } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .download(row.storage_path);
  if (downloadError || !file) {
    throw new EvidenceStorageError("Evidence download failed", { cause: downloadError });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = row.mime_type || file.type || "application/octet-stream";
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new EvidenceStorageError("Evidence media type is not supported");
  }
  const originalName = row.original_name || "evidence";
  return {
    artifactId,
    caseId,
    type: row.type,
    label: originalName,
    mimeType,
    originalName,
    bytes,
    ...(mimeType === "text/plain" ? { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) } : {}),
  };
}
