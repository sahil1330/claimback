import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationRequiredError, requireMerchant } from "@/lib/auth/session";
import { CaseAccessError, assertCaseOwnership } from "@/lib/auth/case-access";
import { EvidenceNotFoundError } from "@/lib/storage/evidence";
import { RecoveryVerificationError, verifyRecovery } from "@/lib/recovery/verify";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };
const requestSchema = z.object({
  artifactId: z.uuid(),
  obligationIds: z.array(z.uuid()).max(20).optional(),
  merchantConfirmedLink: z.boolean().optional(),
});

export async function GET(_request: Request, context: RouteContext) {
  try {
    const caseId = z.uuid().parse((await context.params).id);
    const { supabase, userId } = await requireMerchant();
    await assertCaseOwnership(supabase, caseId, userId);
    const [obligations, verifications] = await Promise.all([
      supabase.from("recovery_obligations")
        .select("id, original_amount_paise, recovered_paise, outstanding_paise, promise_text, promised_for, status, created_at, resolved_at")
        .eq("case_id", caseId).eq("user_id", userId).order("created_at", { ascending: true }),
      supabase.from("recovery_verifications")
        .select("artifact_id, credit_paise, applied_paise, outcome, evidence, created_at")
        .eq("case_id", caseId).eq("user_id", userId).order("created_at", { ascending: true }),
    ]);
    if (obligations.error) throw obligations.error;
    if (verifications.error) throw verifications.error;
    return NextResponse.json({ obligations: obligations.data, verifications: verifications.data },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    if (error instanceof CaseAccessError) return NextResponse.json({ error: "Case not found" }, { status: 404 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid case ID" }, { status: 400 });
    return NextResponse.json({ error: "Could not load recovery history" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const caseId = z.uuid().parse((await context.params).id);
    const input = requestSchema.parse(await request.json());
    const result = await verifyRecovery({ caseId, ...input });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    if (error instanceof CaseAccessError || error instanceof EvidenceNotFoundError) return NextResponse.json({ error: "Case or evidence not found" }, { status: 404 });
    if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Invalid recovery request" }, { status: 400 });
    if (error instanceof RecoveryVerificationError) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ error: "Recovery verification failed; retry this evidence" }, { status: 503 });
  }
}
