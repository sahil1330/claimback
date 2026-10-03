import type { Metadata } from "next";
import { loadCaseView } from "@/components/claims/load-case";
import { CaseWorkspace } from "@/components/claims/case-workspace";

export const metadata: Metadata = { title: "Case details" };

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CaseWorkspace caseView={await loadCaseView(id)} />;
}
