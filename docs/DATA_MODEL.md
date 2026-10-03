# ClaimBack Data Model

## Goals

- simple enough for an 8-hour build;
- RLS-friendly;
- JSONB for extracted evidence;
- integer paise for all money;
- immutable event history;
- support outstanding future credits.

## `profiles`

- `id uuid primary key references auth.users(id)`
- `business_name text`
- `business_type text`
- `preferred_locale text default 'en-IN'`
- `created_at timestamptz`

## `suppliers`

- `id uuid primary key`
- `user_id uuid not null`
- `name text not null`
- `phone text null`
- `created_at timestamptz`

## `cases`

- `id uuid primary key`
- `user_id uuid not null`
- `supplier_id uuid null`
- `status text not null`
- `title text`
- `promised jsonb default '{}'`
- `billed jsonb default '{}'`
- `received jsonb default '{}'`
- `discrepancies jsonb default '[]'`
- `potential_recovery_paise bigint default 0`
- `recovered_paise bigint default 0`
- `outstanding_paise bigint default 0`
- `merchant_approved_at timestamptz null`
- `claim_sent_at timestamptz null`
- `next_follow_up_at timestamptz null`
- `resolved_at timestamptz null`
- `created_at timestamptz`
- `updated_at timestamptz`

## `artifacts`

- `id uuid primary key`
- `user_id uuid not null`
- `case_id uuid not null`
- `type text not null`
- `storage_path text not null`
- `mime_type text null`
- `original_name text null`
- `extracted jsonb null`
- `extraction_status text default 'pending'`
- `created_at timestamptz`

MVP artifact types:

- `invoice`
- `agreement`
- `receiving_photo`
- `damage_photo`
- `credit_note`
- `corrected_invoice`
- `other`

## `supplier_messages`

- `id uuid primary key`
- `user_id uuid not null`
- `case_id uuid not null`
- `direction text`
- `body text`
- `parsed jsonb null`
- `source text`
- `created_at timestamptz`

## `recovery_obligations`

This table directly supports the hero persistent-credit-memory feature.

- `id uuid primary key`
- `user_id uuid not null`
- `case_id uuid not null`
- `supplier_id uuid not null`
- `original_amount_paise bigint not null`
- `recovered_paise bigint default 0`
- `outstanding_paise bigint not null`
- `promise_text text null`
- `promised_for text null`
- `status text not null`
- `created_at timestamptz`
- `resolved_at timestamptz null`

Statuses:

- `OPEN`
- `PARTIALLY_RECOVERED`
- `RECOVERED`
- `DISPUTED`

## `case_events`

- `id bigint generated identity primary key`
- `user_id uuid not null`
- `case_id uuid not null`
- `event_type text not null`
- `payload jsonb default '{}'`
- `created_at timestamptz`

## Case states

- `DRAFT`
- `EVIDENCE_CAPTURED`
- `RECONCILED`
- `NO_DISCREPANCY`
- `DISCREPANCY_FOUND`
- `AWAITING_MERCHANT_APPROVAL`
- `CLAIM_SENT`
- `AWAITING_SUPPLIER`
- `SUPPLIER_RESPONDED`
- `AWAITING_RECOVERY`
- `RECOVERY_VERIFICATION`
- `RESOLVED`
- `ESCALATED`

## Domain shapes

### Promised line

- `skuRef`
- `rawName`
- `quantity`
- `unitPricePaise`
- `scheme`
- `sourceArtifactId`
- `sourceLabel`
- `confidence`

### Billed line

- `skuRef`
- `rawName`
- `quantity`
- `unitPricePaise`
- `discountPaise`
- `sourceArtifactId`
- `sourceLabel`
- `confidence`

### Received line

- `skuRef`
- `rawName`
- `receivedQuantity`
- `damagedQuantity`
- `merchantConfirmed`
- `sourceArtifactId?`
- `sourceLabel`

### Discrepancy

- `id`
- `type`
- `skuRef`
- `description`
- `quantityDelta`
- `expectedUnitPricePaise`
- `billedUnitPricePaise`
- `amountPaise`
- `promisedEvidence`
- `billedEvidence`
- `receivedEvidence`
- `confidence`
- `status`

## RLS

Enable RLS on all merchant tables.

Policy principle:

`auth.uid() = user_id`

Never rely on client filtering for isolation.

## Storage

Bucket:

`claimback-evidence`

Path:

`{user_id}/{case_id}/{artifact_id}-{file_name}`

Restrict users to their own top-level `user_id`.

## Demo seed

Seed **Sharma Medical** with:

- 2 suppliers;
- 3 resolved historical cases;
- 1 active outstanding credit;
- dashboard totals;
- supplier reliability data.
