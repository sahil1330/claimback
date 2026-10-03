# Claude Code Instructions

`AGENTS.md` is the primary implementation authority.

Read `AGENTS.md` first and follow its required read order.

Frozen decisions:

- one Next.js app;
- no monorepo;
- direct OpenAI via `@ai-sdk/openai`;
- Supabase Auth/Postgres/Storage;
- one `ToolLoopAgent`;
- deterministic reconciliation using integer paise;
- merchant approval before supplier-facing claim send;
- workflow-first UI;
- evidence-grounded discrepancies;
- clean-delivery path;
- persistent future-credit verification;
- stateful supplier simulator;
- no fake Paytm integration.

Do not create a competing architecture or product plan.

If an AI SDK API is uncertain, inspect the installed package docs/source.

If product intent is uncertain, prefer `docs/PRODUCT.md` and `docs/DEMO_SCRIPT.md`.
