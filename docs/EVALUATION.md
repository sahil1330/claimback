# ClaimBack Evaluation Plan

## Why

A tested AI system is more credible than a polished single demo.

Never invent benchmark percentages.

## Dataset

Prepare approximately 20–30 synthetic but realistic receiving scenarios.

Suggested mix:

- 6 short-delivery cases;
- 5 rate mismatches;
- 4 missing-scheme cases;
- 3 damage cases;
- 4 combined cases;
- at least 3 clean deliveries.

Each case contains:

- invoice artifact;
- supplier promise;
- receiving statement;
- expected structured fields;
- expected discrepancy labels;
- expected exact amount;
- expected no-claim flag where applicable.

## Metrics

### Extraction

- invoice field accuracy;
- agreement field accuracy;
- quantity/rate accuracy.

### Matching

- SKU/product matching accuracy;
- ambiguous-case detection.

### Discrepancies

- discrepancy detection accuracy or precision/recall;
- clean-delivery false-positive count.

### Financial correctness

- exact money-calculation correctness.

This should ideally be exact once structured inputs are confirmed because it is deterministic.

### Recovery

- missing-credit detection;
- partial-credit balance correctness;
- full-recovery resolution correctness.

## Example output shape

```text
Evaluation cases: 25
Invoice fields correct: <measured>
SKU matches correct: <measured>
Discrepancy cases correct: <measured>
Clean-delivery false claims: <measured>
Money calculations correct after confirmed inputs: <measured>
Recovery-state tests: <measured>
```

Only use actual measured values.

## Pitch rule

An imperfect measured result is stronger than an invented perfect metric.

If a metric is weak, state the failure mode and emphasize that money/state are still deterministic.
