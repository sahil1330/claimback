import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationRequiredError } from "@/lib/auth/session";
import { CaseAccessError } from "@/lib/auth/case-access";
import { extractAgreement, extractInvoice, parseReceiving } from "@/lib/ai/extract";
import { persistExtractionResult } from "@/lib/ai/extraction-persistence";
import { downloadEvidence, EvidenceNotFoundError } from "@/lib/storage/evidence";

const requestSchema = z.object({ caseId: z.uuid(), artifactId: z.uuid() });

export async function POST(request: NextRequest) {
  try {
    const input = requestSchema.parse(await request.json());
    const artifact = await downloadEvidence(input);
    const extractionInput = {
      artifactId: artifact.artifactId,
      label: artifact.label,
      mimeType: artifact.mimeType,
      bytes: artifact.bytes,
      text: artifact.text,
    };
    const result = artifact.type === "invoice" || artifact.type === "corrected_invoice"
      ? await extractInvoice(extractionInput)
      : artifact.type === "agreement"
        ? await extractAgreement(extractionInput)
        : artifact.type === "receiving_photo" || artifact.type === "other"
          ? await parseReceiving(extractionInput)
          : null;
    if (result === null) return NextResponse.json({ error: "This evidence type has no extractor" }, { status: 400 });
    await persistExtractionResult(input.caseId, input.artifactId, result);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    if (error instanceof CaseAccessError || error instanceof EvidenceNotFoundError) return NextResponse.json({ error: "Evidence not found" }, { status: 404 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid extraction request" }, { status: 400 });
    return NextResponse.json({ error: "Evidence extraction request failed" }, { status: 500 });
  }
}
