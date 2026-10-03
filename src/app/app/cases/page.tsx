import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { SectionPlaceholder } from "@/components/shared/section-placeholder";

export const metadata: Metadata = { title: "Claims" };

export default function CasesPage() {
  return <SectionPlaceholder title="Claims" description="Your open claims and verified recoveries will appear here as deliveries are checked." icon={ClipboardList} />;
}
