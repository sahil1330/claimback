# ClaimBack — 8-Hour Implementation Plan

## Goal

Golden path working by Hour 2.5–3.

Hard feature freeze around Hour 6.

No product planning during the event.

## 0:00–0:15 — bootstrap

### Person A
- create/verify Next.js app;
- wire Supabase;
- verify env/auth;
- install AI SDK/OpenAI packages;
- create initial migration.

### Person B
- initialize shadcn;
- set design tokens;
- create app shell;
- create landing skeleton;
- create authenticated navigation.

Both confirm localhost works before splitting.

## 0:15–1:00 — foundations

### Person A
- schema/RLS/storage;
- domain types;
- money helpers;
- model config;
- extraction schemas.

### Person B
- landing hero shell;
- login/onboarding;
- dashboard shell;
- Receive Stock shell;
- fixture-driven product states.

### Checkpoint
Auth works and dashboard renders.

## 1:00–2:00 — evidence + reconciliation

### Person A
- invoice extraction;
- agreement extraction;
- receiving parser;
- deterministic reconciliation;
- evidence references;
- tests for four discrepancy types.

### Person B
- upload experience;
- supplier-promise input;
- receiving voice/text input;
- evidence-grounded discrepancy cards;
- clean-delivery state;
- action timeline.

### Checkpoint
Fixture → source-grounded discrepancy result works.

## 2:00–3:00 — agent + claim loop

### Person A
- ToolLoopAgent;
- tools;
- claim creation;
- merchant approval guard;
- supplier simulator;
- supplier-response parser.

### Person B
- case details;
- claim approval;
- tool/action UI;
- supplier-response timeline;
- demo supplier surface.

### Checkpoint
Detect → Claim → Supplier Response works.

## 3:00–4:00 — persistent recovery

### Person A
- recovery obligations;
- missing/partial/full credit handling;
- verify-recovery tool;
- supplier aggregation;
- demo reset.

### Person B
- outstanding-credit state;
- recovery upload/check UI;
- recovery success state;
- supplier intelligence;
- dashboard metric updates.

### Checkpoint
A supplier promise remains open until verified recovery.

## 4:00–4:40 — voice enhancement

### Person A
- Sarvam wrapper route;
- fallback.

### Person B
- microphone UX;
- transcript confirmation;
- Hinglish polish.

If voice blocks progress for >20 minutes, use typed input.

## 4:40–5:20 — evaluation + trust

Before extra landing polish, finish:

1. no-discrepancy path;
2. evidence grounding;
3. persistent credit;
4. benchmark runner;
5. action timeline.

### Person A
- fixture evaluation runner;
- benchmark output;
- additional recovery tests.

### Person B
- ROI dashboard;
- evidence modal;
- clean-delivery polish;
- timeline polish.

## 5:20–6:00 — visual polish

Now polish:

- three-truth landing animation;
- count-up recovery;
- dashboard hierarchy;
- mobile fit.

Do not add product breadth.

## 6:00 — hard feature freeze

Allowed:

- bugs;
- reliability;
- copy;
- latency;
- visual cleanup;
- deployment fixes.

No new features.

## 6:00–6:45 — break the app

Test:

- wrong file;
- missing agreement;
- ambiguous SKU;
- clean delivery;
- partial supplier acceptance;
- missing promised credit;
- partial promised credit;
- duplicate claim;
- unauthorized route;
- refresh;
- production deployment.

## 6:45–7:15 — production/demo reset

Verify:

- production auth;
- storage;
- OpenAI;
- Supabase;
- supplier simulator;
- demo reset;
- seeded merchant;
- fixture assets.

## 7:15–8:00 — pitch rehearsal

No coding except blocking bug.

Run exact demo at least three times.

## If behind schedule

Cut in this order:

1. extra landing animation;
2. voice polish;
3. supplier-intelligence extras;
4. optional charts;
5. optional OAuth.

Never cut:

- verified recovery;
- deterministic money;
- evidence grounding;
- clean path;
- demo reset.
