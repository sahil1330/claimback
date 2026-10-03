const APP_ORIGIN = "https://claimback.invalid";

export function safeAuthRedirectPath(candidate: string | null): string {
  if (
    !candidate?.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\")
  ) {
    return "/app";
  }

  const parsed = new URL(candidate, APP_ORIGIN);
  if (parsed.origin !== APP_ORIGIN) {
    return "/app";
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
