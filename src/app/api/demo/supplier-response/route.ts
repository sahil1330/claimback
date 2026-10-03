import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationRequiredError, requireMerchant } from "@/lib/auth/session";
import { CaseAccessError } from "@/lib/auth/case-access";
import { supplierScenarioIdSchema, supplierScenarios } from "@/lib/demo/scenarios";
import { DemoResponseError, triggerDemoSupplierResponse } from "@/lib/supplier/demo-response";

export const runtime = "nodejs";

const triggerSchema = z.object({ caseId: z.uuid(), scenarioId: supplierScenarioIdSchema });

export async function GET() {
  if (process.env.DEMO_MODE !== "true") return NextResponse.json({ error: "Demo mode is off" }, { status: 404 });
  try {
    await requireMerchant();
    return NextResponse.json({ scenarios: supplierScenarios.map(({ id, name }) => ({ id, name })) });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    return NextResponse.json({ error: "Could not load demo scenarios" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (process.env.DEMO_MODE !== "true") return NextResponse.json({ error: "Demo mode is off" }, { status: 404 });
  try {
    const input = triggerSchema.parse(await request.json());
    const result = await triggerDemoSupplierResponse(input.caseId, input.scenarioId);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    if (error instanceof CaseAccessError) return NextResponse.json({ error: "Case not found" }, { status: 404 });
    if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Invalid scenario request" }, { status: 400 });
    if (error instanceof DemoResponseError) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ error: "Supplier response could not be processed; retry this step" }, { status: 503 });
  }
}
