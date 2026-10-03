import type { Metadata } from "next";
import { Boxes } from "lucide-react";
import { SectionPlaceholder } from "@/components/shared/section-placeholder";

export const metadata: Metadata = { title: "Receive Stock" };

export default function ReceivePage() {
  return <SectionPlaceholder title="Receive Stock" description="The evidence capture flow will let you add the invoice, supplier promise and what arrived." icon={Boxes} />;
}
