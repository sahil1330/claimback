# ClaimBack

**ClaimBack is an AI Margin Protector for small merchants.**

It remembers what suppliers promised, checks what they billed and what physically arrived, detects supplier leakage, creates evidence, follows the claim, and verifies that the promised recovery actually happened.

## Core loop

**PROMISED vs BILLED vs RECEIVED → DETECT → EVIDENCE → CLAIM → FOLLOW UP → VERIFY → RECOVER**

## Stack

- Next.js App Router + TypeScript
- pnpm
- Tailwind + shadcn/ui
- Motion
- Vercel AI SDK + `ToolLoopAgent`
- direct OpenAI provider via `@ai-sdk/openai`
- Supabase Auth/Postgres/Storage
- Zod
- optional Sarvam voice
- Vercel

## Environment

Copy `.env.example` to `.env.local`.

Keep model IDs in environment variables, not scattered through source code.

## Local foundation setup

1. Run `pnpm install` and fill the Supabase URL and publishable key in `.env.local`.
2. Apply `supabase/migrations/20261003000100_foundation.sql` in the Supabase
   SQL Editor, or set `SUPABASE_DB_URL` locally and run `pnpm db:migrate`.
3. Set the server-only `SUPABASE_SECRET_KEY` and dedicated `DEMO_USER_EMAIL` /
   `DEMO_USER_PASSWORD` locally, then run `pnpm demo:user`. This creates or
   updates a confirmed Sharma Medical demo account and verifies password sign-in
   without sending a confirmation email.
4. Run `pnpm db:verify` for live case, storage and financial-write isolation.
   The check creates disposable test data and removes it before exiting.
5. Apply the recovery migration with `pnpm db:migrate:recovery`, then run
   `pnpm db:verify:recovery` for the recovery ledger and ownership rules.
6. Run `pnpm demo:verify-reset` to restore and verify the scripted merchant
   history three times. Use `pnpm eval` for the 25-case deterministic benchmark.
7. Run `pnpm dev`. Never commit `.env.local` or the demo password.

See `docs/DEPLOYMENT.md` for Vercel environment and demo verification steps.

The browser auth client is `src/lib/supabase/client.ts` (`createClient()`);
use `auth.signInWithPassword`, `auth.signUp`, and `auth.signOut` from it in the
UI. Server layouts use `requireMerchantPage()` from `src/lib/auth/page.ts`.
Sensitive server routes use `requireMerchant()` and `assertCaseOwnership()`
before privileged mutations through `createAdminClient()`. The database grants
browser clients only safe draft/profile writes; financial state, supplier
responses and events are server-owned. The Next.js session proxy runs from
`src/proxy.ts`.

## Golden path

The build is not complete until:

1. merchant signs in;
2. merchant starts `Receive Stock`;
3. invoice is uploaded and parsed;
4. supplier promise is supplied;
5. merchant speaks/types what arrived;
6. ClaimBack finds source-grounded discrepancies;
7. deterministic code calculates recovery;
8. merchant approves the claim;
9. ClaimBack sends through the supplier simulator;
10. supplier responds or promises later credit;
11. ClaimBack keeps the obligation open;
12. later recovery evidence is checked;
13. exact recovery is verified;
14. dashboard margin protected updates.

Read `START_HERE.md` and `AGENTS.md` before coding.
