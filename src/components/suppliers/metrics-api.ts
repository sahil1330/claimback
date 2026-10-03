import { z } from "zod";
import type { SupplierMetrics } from "@/lib/suppliers/metrics";

const paise = z.string().regex(/^\d+$/).transform((value) => BigInt(value));
const rate = z.number().min(0).max(1).nullable();
const supplierMetrics = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  caseCount: z.number().int().nonnegative(),
  deliveryCount: z.number().int().nonnegative(),
  cleanDeliveryCount: z.number().int().nonnegative(),
  discrepancyCount: z.number().int().nonnegative(),
  cleanDeliveryRate: rate,
  discrepancyRate: rate,
  claimCount: z.number().int().nonnegative(),
  claimedPaise: paise,
  recoveredPaise: paise,
  pendingRecoveryPaise: paise,
  resolutionSampleCount: z.number().int().nonnegative(),
  averageResolutionDays: z.number().nonnegative().nullable(),
});

const responseSchema = z.object({ suppliers: z.array(supplierMetrics) });

export function parseSupplierMetricsResponse(value: unknown): SupplierMetrics[] {
  return responseSchema.parse(value).suppliers;
}

export async function fetchSupplierMetrics(signal?: AbortSignal): Promise<SupplierMetrics[]> {
  const response = await fetch("/api/suppliers/metrics", {
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error("Could not load supplier history. Please try again.");
  return parseSupplierMetricsResponse(await response.json());
}
