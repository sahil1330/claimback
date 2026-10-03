# Cloudflare Workers deployment

ClaimBack runs as one Next.js App Router app through the pinned OpenNext Cloudflare adapter. The Worker is named `claimback` in the account recorded in `wrangler.jsonc`.

## Build and deploy

1. Install with `pnpm install --frozen-lockfile`. The `allowBuilds` list in `pnpm-workspace.yaml` permits the `esbuild` and `workerd` install scripts needed by Wrangler.
2. Run `pnpm run cf:build` to create `.open-next/worker.js` and `.open-next/assets`.
3. Run `pnpm run cf:preview` to exercise the built app in the Workers runtime.
4. Run `pnpm run cf:deploy` to upload the verified build, or `pnpm run deploy` to build and upload in one step.

For the connected Cloudflare build, set **Build command** to `pnpm run cf:build` and **Deploy command** to `pnpm run cf:deploy`. The old `pnpm run build` / `npx wrangler deploy` pair only creates `.next` and invokes Wrangler's interactive framework migration.

The adapter's Node.js proxy support is experimental. Keep `src/proxy.ts` and verify sign-in, session refresh, and protected `/app` routes after deployment. If a Windows build fails while following pnpm links, build in Linux or WSL; the Cloudflare build environment uses Linux.

## Environment

Set the following in **Workers & Pages → claimback → Settings → Variables and Secrets**. Set public values in the Cloudflare build's **Build variables and secrets** too, because Next.js inlines `NEXT_PUBLIC_*` at build time. Never put secret values in `wrangler.jsonc` or commit `.env.local`.

| Name | Worker runtime | Build | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | yes | Browser-safe publishable key; RLS still applies |
| `SUPABASE_SECRET_KEY` | secret | only if a build step requires server data | Server-only trusted mutations |
| `OPENAI_API_KEY` | secret | only if a build step requires model access | Extraction and agent |
| `DEMO_MODE` | yes | optional | Set to `true` for the configured demo account |
| `DEMO_USER_EMAIL` | yes | optional | Restricts demo reset to that account |
| `OPENAI_AGENT_MODEL`, `OPENAI_EXTRACTION_MODEL` | optional | optional | Defaults are in the app |
| `SARVAM_API_KEY` | optional secret | no | Optional voice only |

`SUPABASE_DB_URL` and `DEMO_USER_PASSWORD` are used by local setup scripts, not by the Worker. Keep them out of Cloudflare. Add the final Workers URL and `/auth/callback` path to Supabase Auth's allowed redirect URLs before the demo.

`keep_vars: true` in `wrangler.jsonc` preserves variables managed in the Cloudflare dashboard when deploying from the CLI. Check the deployed Worker and its variable names after every configuration change; secrets cannot be read back.
