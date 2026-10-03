import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { loadCaseView } from "@/components/claims/load-case";
import { SupplierSimulator } from "@/components/claims/supplier-simulator";

export const metadata: Metadata = { title: "Demo supplier" };

export default async function DemoSupplierPage({ searchParams }: { searchParams: Promise<{ caseId?: string }> }) {
  const { caseId } = await searchParams;
  if (!z.uuid().safeParse(caseId).success) notFound();
  const caseView = await loadCaseView(caseId!);
  const canTrigger = Boolean(caseView.claimSentAt) && ["CLAIM_SENT", "AWAITING_SUPPLIER", "SUPPLIER_RESPONDED", "AWAITING_RECOVERY", "ESCALATED"].includes(caseView.status);
  return <SupplierSimulator caseId={caseView.id} supplierName={caseView.supplierName ?? "this supplier"} canTrigger={canTrigger} />;
}
