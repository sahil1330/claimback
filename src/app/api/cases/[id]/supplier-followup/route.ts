import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationRequiredError } from "@/lib/auth/session";
import { CaseAccessError } from "@/lib/auth/case-access";
import {
  approveAndSendSupplierFollowup, getSupplierFollowup, prepareSupplierFollowup,
  SupplierFollowupError,
} from "@/lib/claims/followup-message";

const paramsSchema = z.object({ id: z.uuid() });
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("prepare") }),
  z.object({ action: z.literal("approve_and_send"), draftId: z.uuid() }),
]);

function errorResponse(error: unknown) {
  if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (error instanceof CaseAccessError) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Invalid follow-up request" }, { status: 400 });
  if (error instanceof SupplierFollowupError) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ error: "Supplier follow-up could not be completed" }, { status: 500 });
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = paramsSchema.parse(await context.params);
    return NextResponse.json({ draft: await getSupplierFollowup(id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = paramsSchema.parse(await context.params);
    const action = actionSchema.parse(await request.json());
    const draft = action.action === "prepare"
      ? await prepareSupplierFollowup(id)
      : await approveAndSendSupplierFollowup(id, action.draftId);
    return NextResponse.json({ draft }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
