import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationRequiredError } from "@/lib/auth/session";
import { CaseAccessError } from "@/lib/auth/case-access";
import { approveClaim, ClaimOperationError, createDraftClaim, sendSupplierMessage } from "@/lib/claims/operations";

type RouteContext = { params: Promise<{ id: string }> };

/** The approval click is the only public path that records merchant consent. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).origin !== new URL(request.url).origin) {
      return NextResponse.json({ error: "Cross-origin approval denied" }, { status: 403 });
    }
    const caseId = z.uuid().parse((await context.params).id);
    const draft = await createDraftClaim(caseId);
    const approval = await approveClaim(caseId);
    const sent = await sendSupplierMessage(caseId);
    return NextResponse.json({ draft, approval, sent }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }
    if (error instanceof CaseAccessError) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid case ID" }, { status: 400 });
    }
    if (error instanceof ClaimOperationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    return NextResponse.json({ error: "Claim approval failed" }, { status: 500 });
  }
}
