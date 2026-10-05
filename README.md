# ClaimBack

> **🚀 Live Demo & Evaluator Credentials**
> - **Live App:** [claimback.claimback-app.workers.dev](https://claimback.claimback-app.workers.dev/)
> - **Demo Email:** `DEMO_USER_EMAIL=sharma-medical-demo@example.com`
> - **Demo Password:** `DEMO_USER_PASSWORD=qIE2-5ceAEmAo2bV0U0byq76uf6U-ZFz`
>
> *Pre-configured with complete Sharma Medical synthetic evidence, WhatsApp agreements, and verified recovery history.*

**ClaimBack is an AI Margin Protector for small merchants.** It helps a merchant catch money lost while receiving stock, pursue a supplier claim, and confirm that the promised credit or replacement actually arrives. It is built for businesses such as pharmacies and high-volume retailers that manage paper invoices, supplier messages, and frequent deliveries without a full procurement system.

**The question it answers:** What did the supplier promise, what did they bill, and what physically arrived?

| Truth | Typical evidence | What ClaimBack checks |
| --- | --- | --- |
| **Promised** | Supplier agreement or message | Agreed quantity, rate, and free-unit scheme |
| **Billed** | Invoice | Charged quantity, rate, and discounts |
| **Received** | Merchant-confirmed counts and damage | Stock actually delivered in usable condition |

ClaimBack currently handles **short deliveries, rate mismatches, missing free/scheme units, and damaged goods**. It also tracks credits or replacements promised for a later delivery. The outcome that matters is **verified ₹ recovered / margin protected**, rather than the number of claims generated.

## How a case works

1. The merchant signs in and selects **Receive Stock**. They upload an invoice, add the supplier promise, and confirm what arrived using text or optional voice.
2. AI extracts and matches the messy invoice, message, and receiving language. Unclear fields and product matches are surfaced for merchant confirmation. Each accepted fact keeps a reference to its source.
3. Deterministic code compares the three truths and calculates discrepancies using **integer paise**. The case shows the promised, billed, and received values, their evidence, and the calculation. If everything matches, it says **“Delivery looks correct. No claim required.”**
4. ClaimBack assembles a draft claim and evidence packet. **Only the merchant can approve sending it.** In demo mode, an approved claim goes through a stateful, scenario-driven supplier simulator.
5. A supplier response can accept, reject, or promise a later credit. A promise remains an **outstanding recovery obligation**; it does not close the case.
6. ClaimBack checks a later credit note or corrected invoice. Missing credit leaves the case open, partial credit leaves a balance, and full verified recovery can resolve it. The dashboard then reflects the recovered amount.

The case page exposes an action timeline such as “Invoice understood,” “Waiting for merchant approval,” and “Credit verified.” It does not show hidden model reasoning. The authenticated home focuses on margin protected, pending recovery, leakage detected, open claims, and the next **Receive Stock** action.

### Example: a credit promise is still open

Suppose a supplier owes ₹1,584 and replies, “Next invoice mein adjust kar denge.” ClaimBack records ₹1,584 outstanding. On the next invoice it checks for an actual posted adjustment. If ₹1,000 appears, ₹584 stays open; if nothing appears, the full ₹1,584 stays open. The case resolves only when evidence verifies the full recovery.

## What is real in the demo

Authentication, evidence storage, model-backed structured extraction, deterministic reconciliation, case state, supplier-response interpretation, and recovery verification use the product implementation. **External supplier communication and response timing are simulated** by scenario-driven demo transport. The bundled Sharma Medical, supplier, invoice, and credit evidence is [synthetic](fixtures/README.md); no real supplier is contacted and no real credit is issued. ClaimBack has no live WhatsApp or Paytm integration. Paytm for Business and Soundbox-like reminders are a **future distribution idea**.

The deployed demo is at [claimback.claimback-app.workers.dev](https://claimback.claimback-app.workers.dev/). The sample evidence is available under [`public/demo/`](public/demo/), and the walkthrough is in [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md). You can sign in immediately with the evaluator demo credentials provided at the top of this README.

## Run locally

You need Node.js, the repository's pinned **pnpm 11.2.2**, a Supabase project, and an OpenAI API key for extraction and agent actions. Supabase provides Auth, Postgres, and Storage. Use the committed [`.env.example`](.env.example) as the variable checklist.

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
```

Fill `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from Supabase. Set the server-only `SUPABASE_SECRET_KEY` and `OPENAI_API_KEY`; keep them out of `NEXT_PUBLIC_*` variables. The example file includes model IDs, `DEMO_MODE`, the optional Sarvam key, and local setup values. Never commit `.env.local` or demo credentials.

Apply the migrations in order. Either run the commands below with `SUPABASE_DB_URL` set in `.env.local`, or apply the corresponding SQL files from [`supabase/migrations/`](supabase/migrations/) in the Supabase SQL Editor:

```bash
pnpm db:migrate
pnpm db:migrate:recovery
```

To use the scripted Sharma Medical history, set `DEMO_USER_EMAIL` and `DEMO_USER_PASSWORD` in `.env.local`, then provision and verify the account. The reset check replaces that demo account's case history in the configured Supabase project, so use an account intended for the demo.

```bash
pnpm demo:user
pnpm db:verify
pnpm db:verify:recovery
pnpm demo:verify-reset
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Sign in with the configured demo account, or create a merchant account through the app. The verification commands require working Supabase credentials and a migrated database. The demo reset endpoint is limited to the configured demo account and requires `DEMO_MODE=true`.

## Checks and evaluation

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm eval
```

`pnpm eval` runs **25 synthetic scenarios** through the production SKU matcher, reconciliation, recovery allocation, and state-transition logic using confirmed structured facts. The checked-in [report](fixtures/evaluation/latest-results.json) records 25/25 exact money totals, 33/33 source-grounded discrepancy records, and no false claims on three clean cases. **This benchmark does not measure model extraction or a live end-to-end recovery.** A separate opt-in [live text-extraction sample](fixtures/evaluation/README.md) uses real model calls and reports its own limits.

For an end-to-end manual check, follow the [demo script](docs/DEMO_SCRIPT.md): receive stock, review sourced differences, approve the claim, process the simulated supplier response, and verify a later credit. A generated claim or a supplier promise alone is not a recovered case.

## Architecture and safeguards

ClaimBack is one **Next.js App Router + TypeScript** application. Its UI uses Tailwind CSS, shadcn/ui with Radix primitives, and Motion. One Vercel AI SDK `ToolLoopAgent` calls OpenAI through `@ai-sdk/openai`; Zod validates AI and external inputs. Supabase Auth, Postgres, and Storage hold merchant accounts, cases, evidence, and the recovery ledger. The current deployment runs on **Cloudflare Workers via OpenNext**; see the [Cloudflare deployment guide](docs/CLOUDFLARE_DEPLOYMENT.md).

- **Evidence first:** A commercial fact comes from an invoice, supplier agreement, merchant confirmation, supplier response, or verified recovery document. Uncertain facts require confirmation.
- **Deterministic financial logic:** AI understands unstructured evidence; application code calculates money, scheme entitlements, balances, and legal state transitions in integer paise.
- **Approval before sending:** A draft may be prepared automatically, but the send operation checks the recorded merchant approval.
- **Merchant isolation:** Supabase Row Level Security protects merchant-owned data, and sensitive server operations check case ownership again.
- **Persistent recovery:** Supplier promises remain open obligations until a later document verifies full credit, replacement, correction, or settlement.

The repository layout is documented in [`docs/REPO_STRUCTURE.md`](docs/REPO_STRUCTURE.md); the product and technical decisions are in [`docs/PRODUCT.md`](docs/PRODUCT.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/AI_SYSTEM.md`](docs/AI_SYSTEM.md), and [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md). Contributors should read [`AGENTS.md`](AGENTS.md) and the [task workflow](docs/AGENT_TASK_WORKFLOW.md) before editing; the [GitHub Project](https://github.com/users/sahil1330/projects/4) tracks owned work.
