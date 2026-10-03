import type { Metadata } from "next";
import { SupplierMetricsLoader } from "@/components/suppliers/metrics-loader";

export const metadata: Metadata = { title: "Suppliers" };

export default function SuppliersPage() {
  return <SupplierMetricsLoader />;
}
