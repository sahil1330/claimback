import { matchSku } from "../ai/sku-match";
import { transitionCaseState, type CaseState } from "../cases/state";
import { reconcileCase } from "../reconciliation/engine";
import { planRecoveryAllocation } from "../recovery/allocation";
import type { Discrepancy } from "../../types/domain";
import type { EvaluationCase } from "../../../fixtures/evaluation/cases";

type Count = { correct: number; total: number };

export type EvaluationReport = {
  dataset: { cases: number; byCategory: Record<EvaluationCase["category"], number>; synthetic: true };
  extraction: { status: "not_run"; reason: string; invoiceFieldAccuracy: null; agreementFieldAccuracy: null };
  matching: Count & { ambiguousDetected: Count; unmatchedDetected: Count };
  discrepancies: {
    caseOutcomes: Count;
    exactTypeSets: Count;
    truePositives: number;
    falsePositives: number;
    falseNegatives: number;
    cleanFalseClaims: number;
    cleanCases: number;
  };
  money: Count & { basis: "confirmed_structured_facts" };
  sourceGrounding: Count;
  recoveryAllocationAndState: Count & { cases: number; missing: Count; partial: Count; full: Count };
  failures: { caseId: string; check: string; expected: unknown; actual: unknown }[];
  scope: string[];
};

function count(correct: number, total: number): Count { return { correct, total }; }

function sourceGrounded(discrepancy: Discrepancy): boolean {
  return [discrepancy.promisedEvidence, discrepancy.billedEvidence, discrepancy.receivedEvidence]
    .every((source) => Boolean(source.sourceArtifactId && source.sourceLabel && (source.excerpt || source.locator)));
}

function discrepancyCounts(expected: string[], actual: string[]) {
  const remaining = [...expected];
  let truePositives = 0;
  let falsePositives = 0;
  for (const type of actual) {
    const index = remaining.indexOf(type);
    if (index >= 0) { truePositives++; remaining.splice(index, 1); }
    else falsePositives++;
  }
  return { truePositives, falsePositives, falseNegatives: remaining.length };
}

/** Run production deterministic functions against manually confirmed synthetic facts. */
export function evaluateCases(fixtures: readonly EvaluationCase[]): EvaluationReport {
  const byCategory: EvaluationReport["dataset"]["byCategory"] = { short: 0, rate: 0, scheme: 0, damage: 0, combined: 0, clean: 0 };
  const failures: EvaluationReport["failures"] = [];
  const ids = new Set<string>();
  const matching = { correct: 0, total: 0, ambiguousDetected: count(0, 0), unmatchedDetected: count(0, 0) };
  const discrepancies = { caseOutcomes: count(0, 0), exactTypeSets: count(0, 0), truePositives: 0,
    falsePositives: 0, falseNegatives: 0, cleanFalseClaims: 0, cleanCases: 0 };
  const money = { correct: 0, total: 0, basis: "confirmed_structured_facts" as const };
  const sourceGrounding = count(0, 0);
  const recoveryAllocationAndState = { correct: 0, total: 0, cases: 0,
    missing: count(0, 0), partial: count(0, 0), full: count(0, 0) };

  for (const fixture of fixtures) {
    if (ids.has(fixture.id)) throw new Error(`Duplicate evaluation case: ${fixture.id}`);
    ids.add(fixture.id);
    byCategory[fixture.category]++;

    const sku = matchSku(fixture.matching.query, fixture.matching.candidates);
    const matchCorrect = sku.status === fixture.matching.expectedStatus &&
      (sku.status !== "matched" || sku.match.candidate.id === fixture.matching.expectedId);
    matching.total++;
    if (matchCorrect) matching.correct++;
    else failures.push({ caseId: fixture.id, check: "sku_match", expected: fixture.matching, actual: {
      status: sku.status, id: sku.match?.candidate.id ?? null } });
    if (fixture.matching.expectedStatus === "ambiguous") {
      matching.ambiguousDetected.total++;
      if (sku.status === "ambiguous") matching.ambiguousDetected.correct++;
    }
    if (fixture.matching.expectedStatus === "unmatched") {
      matching.unmatchedDetected.total++;
      if (sku.status === "unmatched") matching.unmatchedDetected.correct++;
    }

    const result = reconcileCase(fixture.confirmedInput);
    discrepancies.caseOutcomes.total++;
    if (result.outcome === fixture.expected.outcome) discrepancies.caseOutcomes.correct++;
    else failures.push({ caseId: fixture.id, check: "case_outcome", expected: fixture.expected.outcome, actual: result.outcome });
    const actualTypes = result.discrepancies.map(({ type }) => type);
    const typeCounts = discrepancyCounts(fixture.expected.types, actualTypes);
    discrepancies.truePositives += typeCounts.truePositives;
    discrepancies.falsePositives += typeCounts.falsePositives;
    discrepancies.falseNegatives += typeCounts.falseNegatives;
    discrepancies.exactTypeSets.total++;
    if (typeCounts.falsePositives === 0 && typeCounts.falseNegatives === 0) discrepancies.exactTypeSets.correct++;
    else failures.push({ caseId: fixture.id, check: "discrepancy_types", expected: fixture.expected.types, actual: actualTypes });
    if (fixture.category === "clean") {
      discrepancies.cleanCases++;
      if (result.discrepancies.length > 0) discrepancies.cleanFalseClaims++;
    }

    money.total++;
    if (result.totalPotentialRecoveryPaise === fixture.expected.totalPotentialRecoveryPaise) money.correct++;
    else failures.push({ caseId: fixture.id, check: "money_paise", expected: fixture.expected.totalPotentialRecoveryPaise,
      actual: result.totalPotentialRecoveryPaise });
    for (const item of result.discrepancies) {
      sourceGrounding.total++;
      if (sourceGrounded(item)) sourceGrounding.correct++;
      else failures.push({ caseId: fixture.id, check: "source_grounding", expected: "three traceable sources", actual: item });
    }

    if (fixture.recovery) {
      recoveryAllocationAndState.cases++;
      // The benchmark starts after a supplier promise is recorded. A promise
      // alone does not change recovered or outstanding money.
      let obligation = { id: `${fixture.id}-obligation`, originalAmountPaise: fixture.expected.totalPotentialRecoveryPaise,
        recoveredPaise: 0, outstandingPaise: fixture.expected.totalPotentialRecoveryPaise };
      let state: CaseState = "AWAITING_RECOVERY";
      for (const step of fixture.recovery) {
        const plan = planRecoveryAllocation({ creditPaise: step.creditPaise, obligations: [obligation] });
        obligation = plan.allocations[0];
        state = transitionCaseState(state, "RECOVERY_VERIFICATION");
        state = plan.totalOutstandingPaise === 0
          ? transitionCaseState(state, "RESOLVED", { recoveryVerified: true, outstandingPaise: plan.totalOutstandingPaise })
          : transitionCaseState(state, "AWAITING_RECOVERY");
        const expectedState = step.expectedOutstandingPaise === 0 ? "RESOLVED" : "AWAITING_RECOVERY";
        const correct = plan.status === step.expectedStatus &&
          plan.totalOutstandingPaise === step.expectedOutstandingPaise && state === expectedState;
        recoveryAllocationAndState.total++;
        const category = recoveryAllocationAndState[step.expectedStatus];
        category.total++;
        if (correct) { recoveryAllocationAndState.correct++; category.correct++; }
        else failures.push({ caseId: fixture.id, check: "recovery_allocation_and_state",
          expected: { status: step.expectedStatus, outstandingPaise: step.expectedOutstandingPaise, state: expectedState },
          actual: { status: plan.status, outstandingPaise: plan.totalOutstandingPaise, state } });
      }
    }
  }

  return {
    dataset: { cases: fixtures.length, byCategory, synthetic: true },
    extraction: { status: "not_run", reason: "Fixtures contain manually confirmed structured facts; no model call is made.",
      invoiceFieldAccuracy: null, agreementFieldAccuracy: null },
    matching, discrepancies, money, sourceGrounding, recoveryAllocationAndState, failures,
    scope: [
      "Production SKU matcher, reconciliation, recovery allocation, and state-transition functions run locally.",
      "Raw synthetic artifacts are included for future model evaluation, but extraction accuracy is not measured here.",
      "Recovery figures measure deterministic allocation from assumed posted-credit inputs; model credit extraction, database persistence, and simulator timing are not measured.",
    ],
  };
}
