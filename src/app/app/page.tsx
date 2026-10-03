import type { Metadata } from "next";
import { loadMerchantHistory } from "@/components/dashboard/load-history";
import { getDashboardSummary } from "@/components/dashboard/metrics";
import { DashboardOverview } from "@/components/dashboard/overview";

export const metadata: Metadata = { title: "Overview" };

export default async function AppHomePage() {
  const { cases, suppliers } = await loadMerchantHistory();
  return <DashboardOverview summary={getDashboardSummary(cases)} suppliers={suppliers} />;
}
