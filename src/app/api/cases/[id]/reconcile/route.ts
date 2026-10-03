import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationRequiredError } from "@/lib/auth/session";
import { CaseAccessError } from "@/lib/auth/case-access";
import { CaseReconciliationError, reconcileStoredCase } from "@/lib/cases/reconcile";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const caseId = z.uuid().parse((await context.params).id);
    const result = await reconcileStoredCase(caseId);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    if (error instanceof CaseAccessError) return NextResponse.json({ error: "Case not found" }, { status: 404 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid case facts" }, { status: 400 });
    if (error instanceof CaseReconciliationError) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ error: "Could not reconcile case" }, { status: 500 });
  }
}
