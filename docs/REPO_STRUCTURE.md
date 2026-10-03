# ClaimBack Repository Structure

```text
claimback/
├── AGENTS.md
├── CLAUDE.md
├── README.md
├── .env.example
├── package.json
├── pnpm-lock.yaml
├── components.json
├── next.config.ts
├── tsconfig.json
├── proxy.ts
│
├── docs/
│   ├── PRODUCT.md
│   ├── TECH_STACK.md
│   ├── ARCHITECTURE.md
│   ├── AI_SYSTEM.md
│   ├── DATA_MODEL.md
│   ├── DESIGN_SYSTEM.md
│   ├── IMPLEMENTATION_PLAN.md
│   ├── TASKS.md
│   ├── PREFLIGHT.md
│   ├── DEMO_SCRIPT.md
│   ├── TEST_CASES.md
│   ├── EVALUATION.md
│   ├── MERCHANT_VALIDATION.md
│   └── JUDGE_QA.md
│
├── fixtures/
│   ├── invoices/
│   ├── agreements/
│   ├── damage/
│   ├── credit-notes/
│   └── scenarios/
│       ├── golden-path.json
│       ├── clean-delivery.json
│       ├── rate-mismatch.json
│       ├── missing-scheme.json
│       ├── partial-rejection.json
│       ├── partial-credit.json
│       └── missing-credit.json
│
├── supabase/
│   ├── migrations/
│   └── seed.sql
│
├── public/
│   └── demo/
│
└── src/
    ├── app/
    │   ├── (marketing)/
    │   │   └── page.tsx
    │   ├── (auth)/
    │   │   ├── login/page.tsx
    │   │   └── signup/page.tsx
    │   ├── auth/callback/route.ts
    │   ├── onboarding/page.tsx
    │   ├── app/
    │   │   ├── layout.tsx
    │   │   ├── page.tsx
    │   │   ├── receive/page.tsx
    │   │   ├── cases/[id]/page.tsx
    │   │   └── suppliers/page.tsx
    │   ├── demo/supplier/page.tsx
    │   ├── api/
    │   │   ├── agent/route.ts
    │   │   ├── voice/transcribe/route.ts
    │   │   ├── voice/speak/route.ts
    │   │   ├── demo/reset/route.ts
    │   │   └── demo/supplier-response/route.ts
    │   ├── layout.tsx
    │   └── globals.css
    │
    ├── components/
    │   ├── ui/
    │   ├── ai-elements/
    │   ├── marketing/
    │   ├── dashboard/
    │   ├── receiving/
    │   ├── claims/
    │   ├── suppliers/
    │   └── shared/
    │
    ├── lib/
    │   ├── ai/
    │   │   ├── agent.ts
    │   │   ├── models.ts
    │   │   ├── prompts/
    │   │   │   ├── claimback.ts
    │   │   │   ├── invoice-extractor.ts
    │   │   │   ├── agreement-extractor.ts
    │   │   │   ├── receiving-parser.ts
    │   │   │   └── supplier-response.ts
    │   │   └── tools/
    │   │       ├── extract-invoice.ts
    │   │       ├── extract-agreement.ts
    │   │       ├── parse-receiving.ts
    │   │       ├── reconcile-case.ts
    │   │       ├── create-claim.ts
    │   │       ├── send-supplier-message.ts
    │   │       ├── schedule-followup.ts
    │   │       ├── verify-recovery.ts
    │   │       └── get-supplier-intelligence.ts
    │   ├── reconciliation/
    │   │   ├── engine.ts
    │   │   ├── money.ts
    │   │   └── schemes.ts
    │   ├── supabase/
    │   │   ├── client.ts
    │   │   ├── server.ts
    │   │   ├── proxy.ts
    │   │   └── admin.ts
    │   ├── storage/evidence.ts
    │   ├── voice/sarvam.ts
    │   ├── demo/
    │   │   ├── scenarios.ts
    │   │   └── supplier-simulator.ts
    │   └── env.ts
    │
    └── types/
        ├── domain.ts
        └── agent.ts
```

## Rule

Keep business logic under `src/lib`.

React components should not own reconciliation, money math, state transitions, or authorization.
