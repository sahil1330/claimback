import "server-only";
import { z } from "zod";
import { requireMerchant } from "@/lib/auth/session";
import {
  aggregateSupplierMetrics,
  type SupplierCaseRecord,
  type SupplierRecord,
} from "./metrics";

const pageSize = 250;
const paiseSchema = z.union([
  z.number().int().safe().nonnegative(),
  z.string().regex(/^\d+$/),
]);
const supplierRowSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
});
const caseRowSchema = z.object({
  id: z.uuid(),
  supplier_id: z.uuid().nullable(),
  status: z.string(),
  potential_recovery_paise: paiseSchema,
  recovered_paise: paiseSchema,
  outstanding_paise: paiseSchema,
  claim_sent_at: z.string().nullable(),
  resolved_at: z.string().nullable(),
  created_at: z.string(),
});

type MerchantClient = Awaited<ReturnType<typeof requireMerchant>>["supabase"];

async function loadSuppliers(supabase: MerchantClient, userId: string) {
  const suppliers: SupplierRecord[] = [];
  let afterId: string | null = null;
  do {
    const query = supabase.from("suppliers")
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

async function loadCases(supabase: MerchantClient, userId: string) {
  const cases: SupplierCaseRecord[] = [];
  let afterId: string | null = null;
  do {
    const query = supabase.from("cases")
      .select("id,supplier_id,status,potential_recovery_paise,recovered_paise,outstanding_paise,claim_sent_at,resolved_at,created_at")
      .eq("user_id", userId)
      .order("id", { ascending: true })
      .limit(pageSize);
    const { data, error } = await (afterId ? query.gt("id", afterId) : query);
    if (error) throw error;
    const rows = z.array(caseRowSchema).parse(data ?? []);
    cases.push(...rows.map((row) => ({
      supplierId: row.supplier_id,
      status: row.status,
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

/** Authenticated and RLS-scoped; no service-role reads are used for metrics. */
export async function loadSupplierMetrics() {
  const { supabase, userId } = await requireMerchant();
  const [suppliers, cases] = await Promise.all([
    loadSuppliers(supabase, userId),
    loadCases(supabase, userId),
  ]);
  return aggregateSupplierMetrics(suppliers, cases);
}
