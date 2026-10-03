# ClaimBack Task Board

## Person A — backend / AI / Supabase

Owns primarily:

- `src/lib/**`
- `src/app/api/**`
- `supabase/**`
- server auth;
- database;
- AI/tool logic;
- reconciliation;
- evaluation runner;
- backend tests.

## Person B — product / frontend / design

Owns primarily:

- `src/components/**`
- marketing pages;
- authenticated product pages;
- design tokens;
- Motion;
- UX copy;
- demo visuals.

## Shared-file ownership

Person B owns:

- `src/app/layout.tsx`
- `src/app/globals.css`
- `components.json`

Person A owns:

- dependency changes after bootstrap;
- `.env.example`;
- `proxy.ts`;
- `src/types/domain.ts`.

Avoid simultaneous edits to the same file.

## Person A P0

- [ ] Supabase Auth
- [ ] server/browser Supabase clients
- [ ] proxy session refresh
- [ ] schema migration
- [ ] RLS
- [ ] Storage bucket/policies
- [ ] domain schemas
- [ ] integer-paise money helpers
- [ ] invoice extraction
- [ ] agreement extraction
- [ ] receiving parser
- [ ] discrepancy evidence references
- [ ] deterministic reconciliation
- [ ] clean/no-claim state
- [ ] unit tests for four discrepancy types
- [ ] ToolLoopAgent
- [ ] agent route
- [ ] create-claim tool
- [ ] merchant approval guard
- [ ] supplier simulator
- [ ] supplier-response parser
- [ ] persistent recovery obligation
- [ ] missing/partial/full credit verification
- [ ] supplier aggregation
- [ ] demo reset endpoint
- [ ] evaluation runner
- [ ] actual benchmark output
- [ ] Vercel environment verification

## Person A P1

- [ ] Sarvam voice
- [ ] improved uncertainty handling
- [ ] follow-up scheduling
- [ ] more evaluation fixtures

## Person B P0

- [ ] global design tokens
- [ ] landing hero
- [ ] login
- [ ] onboarding
- [ ] authenticated layout
- [ ] dashboard
- [ ] ROI/margin-protected metrics
- [ ] Receive Stock flow
- [ ] invoice upload
- [ ] agreement input/upload
- [ ] receiving text/voice
- [ ] evidence-grounded discrepancy cards
- [ ] View Evidence interaction
- [ ] clean-delivery success state
- [ ] case details
- [ ] action timeline
- [ ] claim approval
- [ ] supplier response state
- [ ] outstanding-credit state
- [ ] recovery verification UI
- [ ] recovery success animation
- [ ] supplier intelligence
- [ ] error/loading/empty states
- [ ] responsive laptop/mobile behavior

## Person B P1

- [ ] extra hero Motion polish
- [ ] elaborate count-up/scroll effects
- [ ] voice animation
- [ ] polished supplier simulator
- [ ] optional theme toggle

## Integration contract

Person A exports stable domain types early.

Person B builds against fixtures matching those types.

Real API data replaces fixtures without redesigning components.

## Integration checkpoints

### Checkpoint 1
Auth + dashboard.

### Checkpoint 2
Receive-stock inputs → evidence-grounded discrepancy result.

### Checkpoint 3
Claim approval → supplier response.

### Checkpoint 4
Supplier promise stays open → future credit verification → dashboard update.

Do not wait until the end to integrate.

## Scope guard

Anything that does not improve the golden path is P2 until after feature freeze.
