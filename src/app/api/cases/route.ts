import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMerchant, AuthenticationRequiredError } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

const createCaseSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  supplierId: z.uuid().optional(),
  supplierName: z.string().trim().min(1).max(160).optional(),
}).refine((value) => !value.supplierId || !value.supplierName, {
  message: "Choose an existing supplier or enter a new name",
});

export async function POST(request: NextRequest) {
  try {
    const body = createCaseSchema.parse(await request.json());
    const { supabase, userId } = await requireMerchant();
    const admin = createAdminClient();
    let supplierId = body.supplierId ?? null;
    if (body.supplierId) {
      const { data, error } = await supabase.from("suppliers")
        .select("id").eq("id", body.supplierId).eq("user_id", userId).maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
    }
    if (body.supplierName) {
      const { data, error } = await admin.from("suppliers")
        .insert({ user_id: userId, name: body.supplierName }).select("id").single();
      if (error) throw error;
      supplierId = data.id;
    }
    const { data, error } = await admin.from("cases")
      .insert({ user_id: userId, title: body.title ?? "New receiving", supplier_id: supplierId })
      .select("id, title, status, supplier_id, created_at").single();
    if (error) throw error;
    return NextResponse.json({ case: data }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Invalid case input" }, { status: 400 });
    return NextResponse.json({ error: "Could not create case" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { supabase, userId } = await requireMerchant();
    const { data, error } = await supabase.from("cases")
      .select("id, title, status, supplier_id, potential_recovery_paise, recovered_paise, outstanding_paise, created_at, updated_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return NextResponse.json({ cases: data });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    return NextResponse.json({ error: "Could not load cases" }, { status: 500 });
  }
}
