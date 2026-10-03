# ClaimBack — Agent Instructions

This is the primary implementation authority for coding agents.

## Required read order

Before writing code, read:

1. `docs/PRODUCT.md`
2. `docs/TECH_STACK.md`
3. `docs/REPO_STRUCTURE.md`
4. `docs/ARCHITECTURE.md`
5. `docs/AI_SYSTEM.md`
6. `docs/DATA_MODEL.md`
7. `docs/DESIGN_SYSTEM.md`
8. `docs/IMPLEMENTATION_PLAN.md`
9. `docs/TASKS.md`
10. `docs/TEST_CASES.md`
11. `docs/EVALUATION.md`
12. `docs/DEMO_SCRIPT.md`

Do not re-plan the product unless a hard technical blocker makes a frozen decision impossible.

## Product objective

Build **ClaimBack**, an AI Margin Protector for small merchants.

ClaimBack reconstructs three truths:

1. what the supplier promised;
2. what the supplier billed;
3. what physically arrived.

It detects:

- short delivery;
- rate mismatch;
- missing scheme/free units;
- damaged goods;
- promised credits that never appear later.

Then it gathers evidence, creates a draft claim, asks for merchant approval, sends through the demo supplier transport, interprets the supplier response, keeps outstanding obligations open, verifies future credit/replacement, and closes only after verified recovery.

The primary success metric is **₹ recovered / margin protected**.

## Frozen architecture

Use one normal Next.js App Router project.

Do not introduce:

- a monorepo;
- a second backend service;
- Clerk;
- Vercel AI Gateway;
- LangChain;
- a vector database;
- Kafka or queues;
- microservices;
- real WhatsApp as a demo dependency;
- private Paytm APIs;
- n8n before the golden path works;
- a multi-agent swarm.

## Frozen stack

- Next.js App Router
- TypeScript
- pnpm
- Tailwind CSS
- shadcn/ui using Radix primitives
- Motion for React
- Vercel AI SDK
- `@ai-sdk/openai`
- one `ToolLoopAgent`
- Supabase Auth
- Supabase Postgres
- Supabase Storage
- Zod
- Sarvam as optional voice enhancement
- Vercel deployment

## AI SDK rules

Use current installed AI SDK APIs, not stale tutorial syntax.

Expected patterns:

- `ToolLoopAgent`
- `tool({ inputSchema: ... })`
- `stopWhen: stepCountIs(...)`
- `InferAgentUIMessage<typeof agent>`
- `DefaultChatTransport`
- UI-message stream responses for `useChat`
- Zod-validated structured output

If an AI SDK signature is uncertain, inspect the installed `ai` package docs/source before coding.

## Next.js rules

- App Router only.
- Server Components by default.
- Client Components only for interaction/browser APIs.
- Auth refresh/proxy logic stays in `proxy.ts` for the current setup.
- Never expose server secrets through `NEXT_PUBLIC_*`.

## Supabase rules

- browser client: `src/lib/supabase/client.ts`
- server client: `src/lib/supabase/server.ts`
- proxy/session helper: `src/lib/supabase/proxy.ts`
- RLS on merchant-owned data
- sensitive server mutations verify merchant ownership again

## Critical money rule

All monetary values are represented as **integer paise**.

Never use floating-point rupees for business logic.

Never ask the LLM to calculate the final recovery amount.

AI may extract:

- quantity;
- rate;
- scheme;
- discount;
- evidence;
- supplier response.

Deterministic code must calculate:

- quantity variance;
- rate variance;
- scheme entitlement;
- damage value;
- total potential recovery;
- recovered amount;
- outstanding amount.

## Source-of-truth rule

Never invent a commercial fact.

Every fact must come from:

- invoice evidence;
- supplier agreement/message;
- merchant-confirmed receiving input;
- supplier response;
- deterministic tool output;
- verified recovery evidence.

Uncertain values remain uncertain and must be surfaced for confirmation.

## Evidence-grounding rule

Every discrepancy shown in the UI must be traceable to its sources.

Example:

**RATE MISMATCH — ₹260**

Promised: ₹428 × 20  
Source: supplier WhatsApp agreement

Billed: ₹441 × 20  
Source: Invoice #INV-3812

Difference: ₹13 × 20 = ₹260

Discrepancy domain objects must retain evidence references.

## Claim safety rule

The system may build a draft claim automatically.

It must not send a supplier-facing claim until merchant approval is recorded.

`sendSupplierMessage` must verify `merchant_approved_at`.

## Persistent-credit-memory rule

A supplier saying:

> Next invoice mein adjust kar denge.

does **not** resolve a case.

It creates or preserves an outstanding obligation.

Later invoice/credit evidence must be checked against that obligation.

- missing credit → case stays open;
- partial credit → balance stays open;
- full verified credit → case may resolve.

This is a hero differentiator.

## Clean-delivery rule

A clean delivery is a successful outcome.

If promised, billed, and received match, show:

> Delivery looks correct. No claim required.

Do not manufacture a claim because the demo expects one.

## State-machine rule

Allowed high-level states:

- `DRAFT`
- `EVIDENCE_CAPTURED`
- `RECONCILED`
- `NO_DISCREPANCY`
- `DISCREPANCY_FOUND`
- `AWAITING_MERCHANT_APPROVAL`
- `CLAIM_SENT`
- `AWAITING_SUPPLIER`
- `SUPPLIER_RESPONDED`
- `AWAITING_RECOVERY`
- `RECOVERY_VERIFICATION`
- `RESOLVED`
- `ESCALATED`

Tools enforce transitions.

The LLM cannot directly assign arbitrary states.

## UI rule

ClaimBack is a workflow product, not a chat app.

Authenticated home prioritizes:

- margin protected;
- pending recovery;
- leakage detected;
- open claims;
- `Receive Stock`.

Chat/voice is an interaction mechanism only.

## Visible autonomy rule

The UI should expose safe operational progress such as:

- Invoice understood
- Supplier promise matched
- 3 discrepancies found
- Evidence packet created
- Waiting for merchant approval
- Claim sent
- Supplier response received
- Original rate proof located
- Waiting for recovery
- New invoice checked
- Credit verified
- Case closed

Do not expose hidden chain-of-thought.

## Demo-mode rule

`DEMO_MODE=true` must make the demo reliable without faking the core intelligence.

Real:

- auth;
- storage;
- model extraction;
- structured understanding;
- deterministic reconciliation;
- agent tool selection;
- case state;
- supplier-response interpretation;
- recovery verification.

Simulated:

- external supplier;
- communication transport;
- supplier acceptance/rejection;
- future supplier response timing.

The supplier simulator must be stateful and scenario-driven, not “always success.”

## Winning-priority rule

Do not add breadth until all of these work:

1. source-grounded discrepancy UI;
2. clean-delivery/no-claim path;
3. persistent promised-credit verification;
4. benchmark/evaluation runner;
5. visible agent action timeline;
6. ROI/margin-protected dashboard;
7. stable demo reset.

These outrank extra animation, agents, and integrations.

## Scope

MVP discrepancy types only:

1. short delivery;
2. rate mismatch;
3. missing free/scheme units;
4. damaged goods.

Do not add:

- CRM;
- marketing automation;
- social-post generation;
- full ERP;
- GST engine;
- inventory forecasting;
- supplier marketplace;
- generic merchant assistant.

## Code quality

- Strict TypeScript.
- Zod at AI/external boundaries.
- Small functions.
- Avoid `any`.
- Keep business logic out of React components.
- Server secrets remain server-only.
- Log tool activity into `case_events`.
- Run typecheck/tests after each integration milestone.

## Validation loop

Before continuing from a milestone:

1. `pnpm typecheck`
2. `pnpm test`
3. manually verify the golden-path screen
4. fix blockers before adding breadth

Before feature freeze:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

## Landing-page rule

Landing should look high-quality, but it is secondary.

Do not spend more than roughly 30–45 minutes polishing marketing animation before the golden product loop works.

## Paytm-story rule

Do not fake a Paytm integration.

The prototype is standalone.

Future distribution thesis:

- Paytm for Business could be the camera/workflow surface;
- a Soundbox-like surface could deliver voice/reminders for pending recoveries;
- ClaimBack extends the merchant relationship beyond payment collection into margin protection.

Clearly call this future integration.

## Definition of done

The product is demo-ready only if one full case can do:

invoice + agreement + receiving input  
→ AI extraction  
→ source-grounded facts  
→ deterministic reconciliation  
→ discrepancy shown  
→ merchant approval  
→ claim created  
→ supplier message sent  
→ supplier response interpreted  
→ outstanding recovery retained  
→ later recovery evidence checked  
→ recovered amount verified  
→ case resolved

The demo must end in verified recovery, not merely a generated claim.
