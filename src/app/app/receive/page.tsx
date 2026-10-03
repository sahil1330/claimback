import type { Metadata } from "next";
import { ReceiveStock } from "@/components/receiving/receive-stock";

export const metadata: Metadata = { title: "Receive Stock" };

export default function ReceivePage() {
  return <ReceiveStock />;
}
