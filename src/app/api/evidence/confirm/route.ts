import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationRequiredError } from "@/lib/auth/session";
import { CaseAccessError } from "@/lib/auth/case-access";
import { ConfirmationError } from "@/lib/ai/confirm-extraction";
import { confirmEvidenceExtraction } from "@/lib/ai/confirm-extraction-persistence";

export async function POST(request: NextRequest) {
  try {
    const result = await confirmEvidenceExtraction(await request.json());
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    if (error instanceof CaseAccessError) return NextResponse.json({ error: "Evidence not found" }, { status: 404 });
    if (error instanceof ConfirmationError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Invalid confirmation request" }, { status: 400 });
    return NextResponse.json({ error: "Evidence confirmation failed" }, { status: 500 });
  }
}
