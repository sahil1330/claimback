import "server-only";
import { redirect } from "next/navigation";
import { AuthenticationRequiredError, requireMerchant } from "./session";

/** Server layouts/pages use this to keep unauthenticated visitors out. */
export async function requireMerchantPage() {
  try {
    return await requireMerchant();
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect("/login");
    }
    throw error;
  }
}
