# ClaimBack Task Board

The live board is [GitHub Project #4](https://github.com/users/sahil1330/projects/4).
Each task below has a single assigned repository issue. Follow
[`docs/AGENT_TASK_WORKFLOW.md`](AGENT_TASK_WORKFLOW.md) before starting new work.
New tasks must be assigned issues and added to the project to avoid collisions.

| Person A — `sahil1330` | Person B — `harsh-gupta-10` |
| --- | --- |
| [A1 · Bootstrap/auth/data #1](https://github.com/sahil1330/claimback/issues/1) | [B1 · Design/auth shell #9](https://github.com/sahil1330/claimback/issues/9) |
| [A2 · Source-grounded extraction #2](https://github.com/sahil1330/claimback/issues/2) | [B2 · ROI dashboard #10](https://github.com/sahil1330/claimback/issues/10) |
| [A3 · Reconciliation/state #3](https://github.com/sahil1330/claimback/issues/3) | [B3 · Receive Stock #11](https://github.com/sahil1330/claimback/issues/11) |
| [A4 · Agent/approval guard #4](https://github.com/sahil1330/claimback/issues/4) | [B4 · Discrepancy/clean UI #12](https://github.com/sahil1330/claimback/issues/12) |
| [A5 · Supplier simulator #5](https://github.com/sahil1330/claimback/issues/5) | [B5 · Case/approval UI #13](https://github.com/sahil1330/claimback/issues/13) |
| [A6 · Verified recovery #6](https://github.com/sahil1330/claimback/issues/6) | [B6 · Recovery UI #14](https://github.com/sahil1330/claimback/issues/14) |
| [A7 · Reset/evaluation #7](https://github.com/sahil1330/claimback/issues/7) | [B7 · Demo assets/landing #15](https://github.com/sahil1330/claimback/issues/15) |
| [A8 · Optional voice/follow-up #8](https://github.com/sahil1330/claimback/issues/8) | [B8 · Optional voice/polish #16](https://github.com/sahil1330/claimback/issues/16) |

Issues A8 and B8 are P1. All other linked issues are P0.

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
