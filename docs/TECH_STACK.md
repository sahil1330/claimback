# ClaimBack Tech Stack

## Project shape

One normal Next.js application.

Do not use a monorepo.

## Runtime/application

- Next.js App Router
- TypeScript
- pnpm
- Vercel deployment

## UI

- Tailwind CSS
- shadcn/ui using Radix primitives
- Motion for React
- Lucide icons
- Sonner/toast as needed

## AI

- Vercel AI SDK
- `ToolLoopAgent`
- `@ai-sdk/openai`
- `@ai-sdk/react`
- Zod structured boundaries

The team has OpenAI credits, so call OpenAI directly rather than routing through AI Gateway.

Keep model IDs in:

- `OPENAI_AGENT_MODEL`
- `OPENAI_EXTRACTION_MODEL`

## Auth/data/files

- Supabase Auth
- Supabase Postgres
- Supabase Storage
- RLS for tenant isolation

Use email/password as the guaranteed demo path.

Google OAuth is optional if already configured.

## Voice

Sarvam is optional enhancement.

Voice must never block the golden path.

Text input is the fallback.

## n8n

n8n is **not part of the core architecture**.

Do not add it merely for sponsor optics.

Only consider it after the golden path works and only if it creates a visible, useful follow-up workflow without adding fragility.

## Not used

Do not add unless a hard blocker demands it:

- Clerk
- Vercel AI Gateway
- LangChain
- Pinecone/vector DB
- separate FastAPI/Express service
- Kafka/queues
- production WhatsApp
- private Paytm APIs
- multi-agent framework

## Suggested packages

Core dependencies conceptually include:

```text
ai
@ai-sdk/openai
@ai-sdk/react
zod
@supabase/supabase-js
@supabase/ssr
motion
lucide-react
sonner
```

Install shadcn components selectively instead of importing an entire component suite.

If using AI Elements, install only the specific components actually required for streaming/tool UI.

## Build checks

Expected scripts:

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
