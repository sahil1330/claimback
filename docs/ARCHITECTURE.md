# ClaimBack Architecture

## Decision

Use one Next.js App Router application.

No monorepo. No separate backend.

The same app owns marketing, auth UI, merchant UI, route handlers, AI orchestration, tool execution, Supabase access, and the supplier simulator.

## High-level architecture

```text
Browser
  ↓
Next.js App Router
  ↓
Supabase Auth
  ↓
Authenticated Product
  ├─ Supabase Postgres
  ├─ Supabase Storage
  ├─ ClaimBack ToolLoopAgent
  │    ↓
  │  OpenAI
  ├─ Deterministic Reconciliation Engine
  ├─ Case State Machine
  └─ Stateful Supplier Simulator
```

## AI boundary

AI may handle:

- invoice understanding;
- agreement/message understanding;
- receiving-statement parsing;
- SKU normalization/matching;
- supplier-response interpretation;
- tool selection;
- concise merchant language.

## Deterministic boundary

Normal code owns:

- all money math;
- scheme arithmetic;
- recovery balance;
- state transitions;
- authorization checks;
- merchant ownership;
- claim-send guard;
- recovery verification comparisons.

## Money

All money is integer paise.

Example:

`₹428.50` → `42850`

Do not use floating-point rupees.

## Authentication

Use Supabase Auth.

Required:

- email/password;
- pre-created demo user.

Optional if already configured:

- Google OAuth.

OAuth must never be a demo dependency.

## Authorization

Every merchant-owned row includes `user_id`.

Use RLS:

`auth.uid() = user_id`

Sensitive server tools must also verify ownership.

## Storage

Supabase Storage bucket:

`claimback-evidence`

Suggested path:

`{user_id}/{case_id}/{artifact_id}-{filename}`

## OpenAI

Use direct provider through `@ai-sdk/openai`.

Environment variables:

- `OPENAI_AGENT_MODEL`
- `OPENAI_EXTRACTION_MODEL`

Do not hardcode model names in multiple files.

## Agent

One `ToolLoopAgent`.

Suggested hard loop cap:

12 steps.

Do not build multiple agents unless the core flow is already complete.

## Tools

### `extractInvoice`

Input: artifact ID.

Output: structured billed lines, invoice metadata, source references, uncertainty.

### `extractAgreement`

Input: artifact ID or supplied text.

Output: promised terms, source references, uncertainty.

### `parseReceiving`

Input: merchant speech/text.

Output: received quantities, damage, SKU candidates, confirmation needs.

### `reconcileCase`

Input: case ID.

Output: deterministic discrepancy list, evidence references, potential recovery.

This tool is authoritative for money.

### `createClaim`

Input: case ID.

Output: draft claim and evidence packet.

Must not send.

### `sendSupplierMessage`

Input: case ID.

Precondition:

`merchant_approved_at != null`

For hackathon, transport is the supplier simulator.

### `scheduleFollowup`

Input: case ID + reason/time.

Persist follow-up state/event.

### `verifyRecovery`

Input: case ID + credit/replacement evidence.

Output: verified recovered amount, remaining balance, legal state transition.

### `getSupplierIntelligence`

Input: supplier ID.

Output: aggregated reliability/recovery metrics.

## State machine

```text
DRAFT
  ↓
EVIDENCE_CAPTURED
  ↓
RECONCILED
  ├─ NO_DISCREPANCY
  └─ DISCREPANCY_FOUND
       ↓
     AWAITING_MERCHANT_APPROVAL
       ↓
     CLAIM_SENT
       ↓
     AWAITING_SUPPLIER
       ↓
     SUPPLIER_RESPONDED
       ↓
     AWAITING_RECOVERY
       ↓
     RECOVERY_VERIFICATION
       ├─ AWAITING_RECOVERY   (missing/partial)
       └─ RESOLVED            (fully verified)
```

`ESCALATED` may be used for unresolved cases.

The LLM never directly sets arbitrary state.

## Routes

Public:

- `/`
- `/login`
- `/signup`
- `/auth/callback`

Authenticated:

- `/onboarding`
- `/app`
- `/app/receive`
- `/app/cases/[id]`
- `/app/suppliers`

Demo-only:

- `/demo/supplier`

API:

- `/api/agent`
- `/api/voice/transcribe`
- `/api/voice/speak`
- `/api/demo/reset`
- `/api/demo/supplier-response`

## Failure fallbacks

If Sarvam fails: use typed receiving input.

If OAuth fails: use demo email/password.

If simulator transport fails: allow deterministic scenario reset/manual trigger.

If model extraction is uncertain: surface uncertainty.

If animation fails: core product remains usable.
