import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationRequiredError } from "@/lib/auth/session";
import { CaseAccessError } from "@/lib/auth/case-access";
import {
  FollowupScheduleError, readCaseFollowup, scheduleCaseFollowup,
} from "@/lib/followup/schedule";

type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(error: unknown) {
  if (error instanceof AuthenticationRequiredError) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  if (error instanceof CaseAccessError) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return NextResponse.json({ error: "Invalid follow-up request" }, { status: 400 });
  }
  if (error instanceof FollowupScheduleError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  return NextResponse.json({ error: "Follow-up could not be saved; retry" }, { status: 503 });
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const caseId = z.uuid().parse((await context.params).id);
    return NextResponse.json(await readCaseFollowup(caseId),
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).origin !== new URL(request.url).origin) {
      return NextResponse.json({ error: "Cross-origin scheduling denied" }, { status: 403 });
    }
    const caseId = z.uuid().parse((await context.params).id);
    const result = await scheduleCaseFollowup(caseId, await request.json());
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
