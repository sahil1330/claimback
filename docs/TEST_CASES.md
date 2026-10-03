# ClaimBack Test Cases

## Principle

AI can be imperfect in language understanding.

Once facts are confirmed, money and state must be deterministic.

## Reconciliation

### T1 — short delivery

Promised/billed: 50 × ₹100  
Received: 48

Expected: 2 short, ₹200.

### T2 — rate mismatch

Agreed: ₹428  
Billed: ₹441  
Quantity: 20

Expected: ₹13 × 20 = ₹260.

### T3 — missing scheme

Scheme: 10+1  
Qualifying purchase: 50  
Expected free: 5  
Received free: 3

Expected: 2 missing free units.

### T4 — damage

Received: 10  
Damaged: 2  
Reference: ₹300

Expected: ₹600.

### T5 — combined

Shortage + rate mismatch + missing scheme + damage.

Expected total equals exact deterministic sum. No floating-point drift.

## State

### T6 — cannot send without approval

`merchant_approved_at = null`

`sendSupplierMessage` must fail.

### T7 — supplier promise is not recovery

Supplier says:

> Will credit next invoice.

Expected: `AWAITING_RECOVERY`, not `RESOLVED`.

### T8 — full recovery

Outstanding: ₹1,500  
Verified credit: ₹1,500

Expected: resolved.

### T9 — partial recovery

Outstanding: ₹1,500  
Credit: ₹900

Expected: ₹600 remains open.

### T10 — clean delivery

Promised = billed = received.

Expected:

- `NO_DISCREPANCY`
- no claim CTA
- positive confirmation.

## Evidence

### T11 — discrepancy grounding

Every discrepancy has source references for relevant promised/billed/received facts.

### T12 — evidence UI

`View Evidence` resolves to the correct artifact.

## Persistent future credit

### T13 — missing future credit

Outstanding: ₹1,584  
Next invoice: no credit

Expected: ₹1,584 remains outstanding.

### T14 — partial future credit

Outstanding: ₹1,584  
Credit: ₹1,000

Expected: ₹584 remains outstanding.

### T15 — full future credit

Outstanding: ₹1,584  
Credit: ₹1,584

Expected: resolved.

## Security

### T16
Merchant A cannot access Merchant B case.

### T17
Storage policy blocks cross-user evidence.

## AI boundaries

### T18 — ambiguous invoice field
Expected: no fabrication; confirmation state.

### T19 — ambiguous SKU
Expected: ask for confirmation instead of silent match.

## Demo reliability

### T20
Demo reset restores exact golden state.

### T21
Supplier simulator produces intended partial/credit-promise path.

### T22
Production app works after hard refresh.

### T23
Demo account signs in without external-email dependency.

### T24
OpenAI failure produces a recoverable error state.

### T25
Voice failure leaves typed input usable.
