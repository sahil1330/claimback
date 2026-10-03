import { NextResponse } from "next/server";
import { AuthenticationRequiredError } from "@/lib/auth/session";
import { loadSupplierMetrics } from "@/lib/suppliers/load";
import { serializeSupplierMetrics } from "@/lib/suppliers/metrics";

export async function GET() {
  try {
    const metrics = await loadSupplierMetrics();
    return NextResponse.json(
      { suppliers: metrics.map(serializeSupplierMetrics) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }
    return NextResponse.json({ error: "Could not load supplier metrics" }, { status: 500 });
  }
}
