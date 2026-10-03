import "server-only";
import { z } from "zod";
import { requireMerchantPage } from "@/lib/auth/page";
import {
  caseStatuses,
  type CaseHistory,
  type SupplierHistory,
} from "./metrics";

const pageSize = 250;
const paiseSchema = z.union([
  z.number().int().safe().nonnegative(),
  z.string().regex(/^\d+$/),
]);
const caseRowSchema = z.object({
  id: z.uuid(),
  supplier_id: z.uuid().nullable(),
  status: z.enum(caseStatuses),
  title: z.string().nullable(),
  potential_recovery_paise: paiseSchema,
  recovered_paise: paiseSchema,
  outstanding_paise: paiseSchema,
  claim_sent_at: z.string().nullable(),
  resolved_at: z.string().nullable(),
  created_at: z.string(),
});
const supplierRowSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
});

type MerchantClient = Awaited<ReturnType<typeof requireMerchantPage>>["supabase"];

async function loadCases(supabase: MerchantClient, userId: string): Promise<CaseHistory[]> {
  const cases: CaseHistory[] = [];
  let afterId: string | null = null;

  do {
    const query = supabase
      .from("cases")
      .select("id,supplier_id,status,title,potential_recovery_paise,recovered_paise,outstanding_paise,claim_sent_at,resolved_at,created_at")
      .eq("user_id", userId)
      .order("id", { ascending: true })
      .limit(pageSize);
    const { data, error } = await (afterId ? query.gt("id", afterId) : query);
    if (error) throw error;
    const rows = z.array(caseRowSchema).parse(data ?? []);
    cases.push(...rows.map((row) => ({
      id: row.id,
      supplierId: row.supplier_id,
      status: row.status,
      title: row.title,
      potentialRecoveryPaise: BigInt(row.potential_recovery_paise),
      recoveredPaise: BigInt(row.recovered_paise),
      outstandingPaise: BigInt(row.outstanding_paise),
      claimSentAt: row.claim_sent_at,
      resolvedAt: row.resolved_at,
      createdAt: row.created_at,
    })));
    afterId = rows.length === pageSize ? rows[rows.length - 1].id : null;
  } while (afterId);

  return cases;
}

async function loadSuppliers(supabase: MerchantClient, userId: string): Promise<SupplierHistory[]> {
  const suppliers: SupplierHistory[] = [];
  let afterId: string | null = null;

  do {
    const query = supabase
      .from("suppliers")
      .select("id,name")
      .eq("user_id", userId)
      .order("id", { ascending: true })
      .limit(pageSize);
    const { data, error } = await (afterId ? query.gt("id", afterId) : query);
    if (error) throw error;
    const rows = z.array(supplierRowSchema).parse(data ?? []);
    suppliers.push(...rows);
    afterId = rows.length === pageSize ? rows[rows.length - 1].id : null;
  } while (afterId);

  return suppliers;
}

/** Merchant-scoped, read-only data for the B2 views. A7 can replace aggregation. */
export async function loadMerchantHistory() {
  const { supabase, userId } = await requireMerchantPage();
  const [cases, suppliers] = await Promise.all([
    loadCases(supabase, userId),
    loadSuppliers(supabase, userId),
  ]);
  return { cases, suppliers };
}
