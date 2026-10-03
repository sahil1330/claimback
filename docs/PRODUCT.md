# ClaimBack Product Specification

## Product

**ClaimBack — AI Margin Protector for Small Merchants**

### Primary promise

**Never pay for stock you didn't receive.**

### Stronger product promise

**Do not forget money your supplier promised to return.**

## Product definition

ClaimBack is a camera/voice-first receiving and supplier-recovery companion.

It reconstructs:

1. **PROMISED** — what the supplier agreed to;
2. **BILLED** — what the invoice says;
3. **RECEIVED** — what physically arrived.

It identifies supported discrepancies, creates evidence, carries the recovery workflow forward, remembers unresolved promises, and verifies whether the merchant actually got the money or stock back.

## Target merchant

Prioritize high-SKU/high-frequency receiving businesses:

- pharmacies;
- FMCG-heavy retailers;
- cosmetics retailers;
- electronics/accessories retailers;
- wholesalers.

The strongest persona has:

- several suppliers;
- paper invoices;
- WhatsApp/phone purchasing;
- frequent rate/scheme changes;
- damaged/short deliveries;
- credits promised for later;
- no sophisticated procurement ERP.

Do not position the MVP as equally necessary for every tiny kirana.

## Problem

Merchant purchasing data is fragmented across:

- invoice images/PDFs;
- WhatsApp messages;
- spoken memory;
- physical delivery;
- damage photos;
- future supplier promises.

Leakage can include:

- short delivery;
- wrong purchase rate;
- missing free/scheme units;
- damaged goods;
- promised credits not appearing later.

The most important pain is not only detection. It is **persistent financial memory across time**.

## Hero differentiator: persistent supplier memory

Day 1:

Supplier owes ₹1,584.

Supplier says:

> Next invoice mein adjust kar denge.

ClaimBack records an outstanding obligation.

Day 4:

A new invoice arrives.

ClaimBack asks:

> Was the promised ₹1,584 credit actually included?

If no, the case stays open. If partial, the remaining balance stays open. If full, ClaimBack verifies the recovery and resolves the case.

## AI necessity

AI is useful because the inputs are unstructured.

Example:

Invoice: `MAGGI MASALA 70GX96`

WhatsApp: `maggi small wala 50 peti 10+1`

Merchant: `Maggi ke do carton kam aaye`

AI maps the evidence. Deterministic code then calculates the money.

## Core loop

**DETECT → EVIDENCE → CLAIM → FOLLOW UP → VERIFY → RECOVER**

## MVP discrepancy types

Only build:

1. short delivery;
2. rate mismatch;
3. missing free/scheme units;
4. damaged goods.

## Clean outcome

If evidence matches, ClaimBack must say:

> Delivery looks correct. No claim required.

This is required for trust.

## User experience

The merchant should mainly use:

- camera;
- short voice/text;
- simple confirmations.

Prefer:

> ₹850 ka difference mila. Supplier ko claim bheju?

Avoid accounting/procurement jargon.

## Dashboard

Primary business metrics:

- supplier purchases;
- leakage detected;
- recovered;
- still recoverable;
- margin protected.

Primary CTA:

**Receive Stock**

## Supplier Intelligence

A thin layer built from case history:

- delivery accuracy;
- discrepancy frequency;
- total claimed;
- total recovered;
- average resolution time.

Do not build a supplier marketplace.

## Merchant Growth AI fit

ClaimBack fits through:

**manage operations → protect margin → improve working capital → support growth**

Growth is not only revenue. ClaimBack focuses on profit growth and working-capital protection.

## Paytm distribution thesis

The MVP is standalone.

Future distribution can be described as:

- Paytm for Business as camera/workflow surface;
- a Soundbox-like surface for reminders/voice;
- ClaimBack extending Paytm's merchant relationship beyond payments into margin protection.

Do not fake these integrations.

## Non-goals

ClaimBack is not:

- generic merchant ChatGPT;
- full ERP;
- accounting suite;
- CRM;
- marketing automation;
- social-post generator;
- inventory forecasting suite;
- legal claims system;
- payment processor.

## Success metric

Primary:

**₹ recovered / margin protected**

Secondary:

- discrepancy value detected;
- time to claim;
- recovery rate;
- resolution time;
- false-positive claims on clean deliveries;
- supplier discrepancy frequency.
