import type { Metadata } from "next";
import { loadMerchantHistory } from "@/components/dashboard/load-history";
import { getSupplierSummaries } from "@/components/dashboard/metrics";
import { SuppliersOverview } from "@/components/suppliers/overview";

export const metadata: Metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  const { cases, suppliers } = await loadMerchantHistory();
  return <SuppliersOverview suppliers={getSupplierSummaries(suppliers, cases)} />;
}
