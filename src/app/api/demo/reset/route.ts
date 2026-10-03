import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationRequiredError } from "@/lib/auth/session";
import { DemoResetError, resetDemoForCurrentMerchant } from "@/lib/demo/reset";

export const runtime = "nodejs";

const resetRequestSchema = z.object({ confirmation: z.literal("RESET_ALL_DEMO_CASES") });

export async function POST(request: NextRequest) {
  if (process.env.DEMO_MODE !== "true") return NextResponse.json({ error: "Demo mode is off" }, { status: 404 });
  try {
    const text = await request.text();
    if (text.length > 256) return NextResponse.json({ error: "Reset request is too large" }, { status: 413 });
    const confirmed = text ? resetRequestSchema.parse(JSON.parse(text) as unknown) : null;
    const summary = await resetDemoForCurrentMerchant({ allowActiveCaseDeletion: confirmed?.confirmation === "RESET_ALL_DEMO_CASES" });
    return NextResponse.json({ summary }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Invalid reset confirmation" }, { status: 400 });
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    if (error instanceof DemoResetError) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ error: "Demo reset failed; retry" }, { status: 503 });
  }
}
