import type { Metadata } from "next";
import { Truck } from "lucide-react";
import { SectionPlaceholder } from "@/components/shared/section-placeholder";

export const metadata: Metadata = { title: "Suppliers" };

export default function SuppliersPage() {
  return <SectionPlaceholder title="Suppliers" description="Supplier history and recovery patterns will appear here once deliveries are recorded." icon={Truck} />;
}
