# ClaimBack — Coding Agent Handover

This folder is the authoritative implementation handoff for the Paytm Build for India AI Hackathon.

## Required read order

1. `AGENTS.md`
2. `docs/PRODUCT.md`
3. `docs/TECH_STACK.md`
4. `docs/REPO_STRUCTURE.md`
5. `docs/ARCHITECTURE.md`
6. `docs/AI_SYSTEM.md`
7. `docs/DATA_MODEL.md`
8. `docs/DESIGN_SYSTEM.md`
9. `docs/IMPLEMENTATION_PLAN.md`
10. `docs/TASKS.md`
11. `docs/TEST_CASES.md`
12. `docs/EVALUATION.md`
13. `docs/DEMO_SCRIPT.md`
14. `docs/JUDGE_QA.md`
15. `docs/PREFLIGHT.md`
16. `docs/MERCHANT_VALIDATION.md`

Do not re-plan the product unless a frozen decision is technically impossible.

## Product

**ClaimBack is an AI Margin Protector for small merchants.**

It remembers what a supplier promised, checks what was billed and physically arrived, detects supplier leakage, creates evidence, follows the claim, and verifies that the promised money or stock actually came back.

## Core loop

**PROMISED vs BILLED vs RECEIVED → DETECT → EVIDENCE → CLAIM → FOLLOW UP → VERIFY → RECOVER**

## Technical principle

> AI understands messy reality. Deterministic software handles money, authorization, and state.

## Launch prompt

> Read `START_HERE.md`, then `AGENTS.md`, then every document in the required read order. Do not re-plan ClaimBack. Implement the frozen architecture and execute `docs/TASKS.md` in priority order. Build the golden path before optional polish. Person A owns backend/AI/Supabase and Person B owns product UI/landing/design. Maintain stable integration contracts and do not introduce new infrastructure without a hard blocker. Every discrepancy must be source-grounded. A clean delivery must produce no claim. A supplier promise is not recovery; verify the future credit before resolving the case. The demo must end in verified ₹ recovery.

## Final priority order

1. Reliable end-to-end recovery demo
2. Source-grounded evidence
3. Deterministic money correctness
4. Persistent future-credit verification
5. Visible agent actions
6. Auth and product feel
7. Evaluation benchmark
8. Hindi/Hinglish voice
9. Supplier intelligence
10. Landing-page visual polish
