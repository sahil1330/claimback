import { NextResponse } from "next/server";
import { AuthenticationRequiredError } from "@/lib/auth/session";
import { DemoResetError, resetDemoForCurrentMerchant } from "@/lib/demo/reset";

export const runtime = "nodejs";

export async function POST() {
  if (process.env.DEMO_MODE !== "true") return NextResponse.json({ error: "Demo mode is off" }, { status: 404 });
  try {
    const summary = await resetDemoForCurrentMerchant();
    return NextResponse.json({ summary }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    if (error instanceof DemoResetError) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ error: "Demo reset failed; retry" }, { status: 503 });
  }
}
