import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationRequiredError } from "@/lib/auth/session";
import { CaseAccessError } from "@/lib/auth/case-access";
import { inspectCase } from "@/lib/cases/reconcile";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const caseId = z.uuid().parse((await context.params).id);
    const data = await inspectCase(caseId);
    return NextResponse.json({ case: data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    if (error instanceof CaseAccessError) return NextResponse.json({ error: "Case not found" }, { status: 404 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid case ID" }, { status: 400 });
    return NextResponse.json({ error: "Could not load case" }, { status: 500 });
  }
}
