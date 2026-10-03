# Synthetic evaluation fixtures

Run from the repository root:

```sh
node scripts/run-evaluation.mjs
```

The runner evaluates 25 synthetic receiving cases. Each case includes invoice,
supplier-promise, and merchant-receiving text plus manually confirmed structured
facts and an independently specified expected amount in integer paise. It calls
the product's SKU matcher, reconciliation engine, recovery allocator, and case
state-transition helper. Credit amounts in recovery steps represent later
documents with an explicit posted credit; zero represents a later invoice with
no credit.

The report is written to `latest-results.json`. It does **not** measure model
extraction, credit-document interpretation, database persistence, or simulator
timing. Those require separate live runs; this benchmark does not infer their
accuracy from pre-structured fixtures.

## Opt-in live text extraction

With an OpenAI key and extraction model in `.env.local`, run a small sample:

```sh
node --env-file=.env.local scripts/run-evaluation-live.mjs C01,N01,R01
```

Pass `all` in place of the comma-separated IDs to evaluate all 25 cases. This
uses two real model calls per case and writes `latest-live-results.json`.
It checks five invoice fields and five supplier-promise fields against the
manual fixture truth. It reports ready, needs-confirmation, and error results
separately. It does not infer image/PDF, receiving, or recovery-extraction
accuracy from these text samples. Ordinary `pnpm test` skips the paid live run.
