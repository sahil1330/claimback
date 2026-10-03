import type { Metadata } from "next";
import { ShellPreview } from "@/components/dashboard/shell-preview";

export const metadata: Metadata = { title: "Overview" };

export default function AppHomePage() {
  return <ShellPreview />;
}
