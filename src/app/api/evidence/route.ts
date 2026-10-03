import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationRequiredError } from "@/lib/auth/session";
import { CaseAccessError } from "@/lib/auth/case-access";
import {
  downloadEvidence,
  EvidenceNotFoundError,
  EvidenceStorageError,
  uploadEvidence,
} from "@/lib/storage/evidence";

const uploadFieldsSchema = z.object({
  caseId: z.uuid(),
  type: z.enum(["invoice", "agreement", "receiving_photo", "damage_photo", "credit_note", "corrected_invoice", "other"]),
});

function errorResponse(error: unknown) {
  if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (error instanceof CaseAccessError || error instanceof EvidenceNotFoundError) return NextResponse.json({ error: "Evidence not found" }, { status: 404 });
  if (error instanceof z.ZodError || error instanceof EvidenceStorageError) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ error: "Evidence request failed" }, { status: 500 });
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const fields = uploadFieldsSchema.parse({ caseId: form.get("caseId"), type: form.get("type") });
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Evidence file is required" }, { status: 400 });
    const artifact = await uploadEvidence({ ...fields, file });
    return NextResponse.json({ artifact }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const caseId = z.uuid().parse(request.nextUrl.searchParams.get("caseId"));
    const artifactId = z.uuid().parse(request.nextUrl.searchParams.get("artifactId"));
    const artifact = await downloadEvidence({ caseId, artifactId });
    const name = encodeURIComponent(artifact.originalName.replace(/["\r\n]/g, "_"));
    return new Response(Buffer.from(artifact.bytes), {
      headers: {
        "Content-Type": artifact.mimeType,
        "Content-Disposition": `inline; filename="evidence"; filename*=UTF-8''${name}`,
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
