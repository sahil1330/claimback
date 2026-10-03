# ClaimBack Preflight

Complete before coding pressure begins.

## OpenAI

- [ ] API key available
- [ ] credits/billing confirmed
- [ ] basic API call tested
- [ ] chosen model IDs confirmed in the team's account
- [ ] one image/multimodal extraction request tested
- [ ] model names placed in env, not code

## Supabase

- [ ] project exists
- [ ] project URL copied
- [ ] publishable key copied
- [ ] server/admin secret available if needed
- [ ] email/password auth tested
- [ ] demo user created
- [ ] optional Google OAuth already configured or intentionally skipped
- [ ] redirect URLs configured
- [ ] SQL editor access verified
- [ ] Storage plan verified

## Vercel

- [ ] project/team access confirmed
- [ ] Git repo or CLI workflow ready
- [ ] env-variable workflow understood
- [ ] production deploy permission confirmed

## Sarvam

- [ ] API key available
- [ ] one Hinglish/Hindi transcription tested

If not ready, use typed receiving input.

Voice never blocks the demo.

## Demo account

Create dedicated merchant:

**Sharma Medical**

Keep demo credentials available offline to both teammates.

## Fixture assets

Prepare:

- [ ] realistic supplier invoice
- [ ] WhatsApp-style supplier agreement
- [ ] damaged-stock photo
- [ ] corrected invoice / credit note
- [ ] golden scenario
- [ ] clean-delivery scenario
- [ ] partial-credit scenario
- [ ] missing-credit scenario

Synthetic demo data is fine if presented honestly.

## Merchant validation

If possible, speak to 3–5 relevant merchants.

Use `docs/MERCHANT_VALIDATION.md`.

Do not invent validation numbers.

## Both laptops

- [ ] supported Node.js
- [ ] pnpm
- [ ] Git
- [ ] GitHub access
- [ ] coding-agent IDE access
- [ ] optional Supabase CLI
- [ ] optional Vercel CLI

## Security

Never commit:

- `.env.local`
- OpenAI API key
- Supabase server secret
- Sarvam key

RLS must still protect data.

## Event-rule check

If pre-written solution code is prohibited, only use specifications and permitted boilerplate.

These docs are planning/context, not a pre-built solution.
