# ClaimBack Design System

## Goal

The MVP should look like a real product, not a hackathon admin dashboard.

It should feel trustworthy, operational, financially clear, modern, and fast.

## Typography

Use:

- Geist Sans for interface and marketing copy;
- Geist Mono for invoice numbers, event metadata, structured evidence, and technical financial detail.

## Visual system

Authenticated app:

- light operational UI;
- warm off-white/neutral background;
- near-black text;
- green/emerald for recovered/protected;
- amber for pending;
- red for leakage/errors;
- muted gray for evidence metadata.

Avoid:

- purple AI gradients;
- constant glassmorphism;
- neon/cyberpunk;
- excessive glowing borders.

## Dashboard

Hero hierarchy:

**₹10,860**  
MARGIN PROTECTED

Secondary business metrics:

- supplier purchases;
- leakage detected;
- recovered;
- still recoverable;
- open claims.

Primary CTA:

**Receive Stock**

## Landing page

The landing page can be cinematic but must not consume core build time.

Eyebrow:

**AI Margin Protector for Merchants**

Headline:

**Stop losing margin before stock hits the shelf.**

Subcopy:

ClaimBack reads supplier promises, invoices and deliveries, catches leakage, and follows every claim until the money or stock actually comes back.

Primary CTA:

**Open live demo**

Secondary CTA:

**See how it works**

## Hero animation

Use DOM/CSS/Motion, not WebGL.

Show:

### PROMISED

`50 units · ₹428 · 10+1`

### BILLED

`50 units · ₹441`

### RECEIVED

`48 units · 3 free · 2 damaged`

Resolve into:

**₹1,584 potential recovery**

Then:

`Claim sent → Credit verified → ₹1,584 recovered`

## Motion

Good:

- staged card entrance;
- number count-up;
- shared-layout transition;
- timeline progress;
- subtle scroll reveal;
- small hover lift.

Avoid:

- bouncing everything;
- long intro;
- particles;
- complex 3D;
- animation blocking demo flow.

Target normal UI duration:

200–500ms.

Respect reduced motion.

## Landing time cap

Before the golden path works, spend no more than roughly 30–45 minutes on marketing polish.

## Receive Stock

Desktop:

1. Invoice
2. Supplier promise
3. What arrived

Then reconciliation below.

Mobile:

single stepper.

## Evidence-grounded discrepancy cards

Example:

**RATE MISMATCH** — **₹260**

Promised  
₹428 × 20  
`WhatsApp agreement`

Billed  
₹441 × 20  
`Invoice #INV-3812`

**₹13 × 20 = ₹260**

Action:

`View Evidence`

## Clean state

If no supported discrepancy:

**Delivery looks correct ✓**

No claim required.

## Case page

Top:

- supplier;
- case state;
- potential recovery;
- recovered/outstanding.

Middle:

- source-grounded discrepancy cards.

Bottom:

- action/evidence timeline.

Primary action where legal:

**Approve & Send Claim**

## Agent timeline

Before approval:

- ✓ Invoice understood
- ✓ Supplier promise matched
- ✓ 3 discrepancies found
- ✓ Evidence packet created
- ○ Waiting for merchant approval

After approval:

- ✓ Claim sent
- ✓ Supplier response received
- ✓ Shortage accepted
- ! Rate difference rejected
- ✓ Original rate proof located
- → Waiting for recovery

After recovery:

- ✓ New invoice checked
- ✓ Promised credit found
- ✓ ₹1,584 recovered
- ✓ Case closed

Never show hidden model reasoning.

## Supplier page

Show:

- delivery accuracy;
- discrepancy rate;
- total claimed;
- total recovered;
- average resolution time.

Only add charts if easy.

## shadcn components

Install only what is used:

- Button
- Card
- Badge
- Input
- Textarea
- Dialog
- Sheet
- Tabs
- Progress
- Table
- Separator
- Tooltip
- Avatar
- Dropdown Menu
- Skeleton
- Alert
- Sonner/toast

## AI Elements

Use only where useful:

- message;
- tool;
- confirmation;
- optional speech input.

Do not make the whole product a chat transcript.
