import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationRequiredError } from "@/lib/auth/session";
import { CaseAccessError } from "@/lib/auth/case-access";
import { CaseFactsError, saveCaseFacts } from "@/lib/cases/facts";
import { reconciliationInputSchema } from "@/lib/reconciliation/engine";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const caseId = z.uuid().parse((await context.params).id);
    const input = reconciliationInputSchema.parse(await request.json());
    const result = await saveCaseFacts(caseId, input);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    if (error instanceof CaseAccessError) return NextResponse.json({ error: "Case not found" }, { status: 404 });
    if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Invalid case facts" }, { status: 400 });
    if (error instanceof CaseFactsError) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ error: "Could not save case facts" }, { status: 500 });
  }
}
