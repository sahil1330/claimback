# Deployment and demo readiness

The local production build passes. The repository is not yet linked to a Vercel
project, so a deployed run has not been verified.

## Vercel environment

Set these in the Vercel project before deployment:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL for browser and server clients |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe key; RLS still applies |
| `SUPABASE_SECRET_KEY` | Server-only case operations and demo reset |
| `OPENAI_API_KEY` | Extraction, response interpretation, and agent calls |
| `OPENAI_AGENT_MODEL` | Configured ToolLoopAgent model |
| `OPENAI_EXTRACTION_MODEL` | Configured structured extraction model |
| `DEMO_MODE` | Set to `true` for the hackathon supplier simulator and reset |
| `DEMO_USER_EMAIL` | Dedicated demo account allowed to reset its own history |

Set `DEMO_USER_PASSWORD` only when using the provisioning or live reset
verification scripts in that environment. Browser login uses the password the
merchant enters; the application does not read this variable. `SUPABASE_DB_URL`
is for local migration commands and should not be added to the Vercel runtime.
`NEXT_PUBLIC_APP_URL` is present in the example environment but is not read by
the current app; set it when an absolute app URL is needed.

Apply both SQL migrations before the first deployed run:

1. `supabase/migrations/20261003000100_foundation.sql`
2. `supabase/migrations/20261003000200_recovery_verification.sql`

Provision the dedicated Sharma Medical user with `pnpm demo:user`, then run
`pnpm demo:verify-reset` against the same Supabase project. That command resets
the demo account three times and verifies merchant-scoped case history, exact
balances, one open obligation, and readable evidence files. The reset endpoint
is `POST /api/demo/reset`, requires that configured account's authenticated
session, and is disabled when `DEMO_MODE` is not `true`.

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` before deploying.
After deployment, sign in as the demo user and complete the full recovery path
from `docs/DEMO_SCRIPT.md` three times, resetting between runs. Record actual
deployed results in issue #7; the local build and synthetic benchmark are not
a substitute for that walkthrough.
