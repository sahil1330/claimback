import { extractAgreement, extractInvoice, type ExtractionInput } from "../ai/extract";
import type { ExtractionResult, InvoiceFacts, AgreementFacts } from "../../types/domain";
import type { EvaluationCase } from "../../../fixtures/evaluation/cases";

type StatusCounts = { ready: number; needsConfirmation: number; error: number };
type FieldCheck = { field: string; correct: boolean; expected: unknown; actual: unknown };
type DocumentResult = {
  status: "ready" | "needs_confirmation" | "error";
  errorCode: string | null;
  confirmations: number;
  fields: { correct: number; total: number; failures: FieldCheck[] };
};

export type LiveExtractionReport = {
  dataset: { casesAvailable: number; casesAttempted: number; selectedIds: string[]; synthetic: true };
  model: string | null;
  invoice: { status: StatusCounts; fields: { correct: number; total: number } };
  agreement: { status: StatusCounts; fields: { correct: number; total: number } };
  totalCalls: number;
  results: { caseId: string; invoice: DocumentResult; agreement: DocumentResult }[];
  scope: string[];
};

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function check(field: string, expected: unknown, actual: unknown): FieldCheck {
  return { field, expected, actual, correct: same(expected, actual) };
}

function summarize<T>(result: ExtractionResult<T>, checks: FieldCheck[]): DocumentResult {
  return {
    status: result.status,
    errorCode: result.status === "error" ? result.error.code : null,
    confirmations: result.status === "needs_confirmation" ? result.confirmations.length : 0,
    fields: { correct: checks.filter(({ correct }) => correct).length, total: checks.length,
      failures: checks.filter(({ correct }) => !correct) },
  };
}

function invoiceChecks(result: ExtractionResult<InvoiceFacts>, fixture: EvaluationCase): FieldCheck[] {
  const expected = fixture.confirmedInput.groups[0].billed;
  const actual = result.status === "error" ? null : result.facts;
  const line = actual?.lines[0];
  const checks = [
    check("invoiceNumber", `INV-EVAL-${fixture.id}`, actual?.invoiceNumber ?? null),
    check("lineCount", 1, actual?.lines.length ?? null),
    check("skuRef", expected.skuRef, line?.skuRef ?? null),
    check("quantity", expected.quantity, line?.quantity ?? null),
    check("unitPricePaise", expected.unitPricePaise, line?.unitPricePaise ?? null),
  ];
  return result.status === "error" ? checks.map((item) => ({ ...item, correct: false })) : checks;
}

function agreementChecks(result: ExtractionResult<AgreementFacts>, fixture: EvaluationCase): FieldCheck[] {
  const expected = fixture.confirmedInput.groups[0].promised;
  const actual = result.status === "error" ? null : result.facts;
  const line = actual?.lines[0];
  const checks = [
    check("lineCount", 1, actual?.lines.length ?? null),
    check("skuRef", expected.skuRef, line?.skuRef ?? null),
    check("quantity", expected.quantity, line?.quantity ?? null),
    check("unitPricePaise", expected.unitPricePaise, line?.unitPricePaise ?? null),
    check("scheme", expected.scheme, line?.scheme ?? null),
  ];
  return result.status === "error" ? checks.map((item) => ({ ...item, correct: false })) : checks;
}

function input(fixture: EvaluationCase, kind: "invoice" | "agreement"): ExtractionInput {
  const group = fixture.confirmedInput.groups[0];
  const text = kind === "invoice" ? fixture.artifacts.invoice : fixture.artifacts.supplierPromise;
  const source = kind === "invoice" ? group.billed.source : group.promised.source;
  return {
    artifactId: source.sourceArtifactId,
    label: source.sourceLabel,
    mimeType: "text/plain",
    bytes: new TextEncoder().encode(text),
    text,
  };
}

function recordStatus(counts: StatusCounts, status: DocumentResult["status"]) {
  if (status === "ready") counts.ready++;
  else if (status === "needs_confirmation") counts.needsConfirmation++;
  else counts.error++;
}

/** Opt-in live model measurement. This function makes two paid model calls per case. */
export async function evaluateLiveExtraction(
  fixtures: readonly EvaluationCase[],
  selectedIds: readonly string[],
): Promise<LiveExtractionReport> {
  const selected = selectedIds.map((id) => {
    const fixture = fixtures.find((item) => item.id === id);
    if (!fixture) throw new Error(`Unknown evaluation case: ${id}`);
    return fixture;
  });
  if (new Set(selectedIds).size !== selectedIds.length) throw new Error("Duplicate evaluation case IDs");
  const report: LiveExtractionReport = {
    dataset: { casesAvailable: fixtures.length, casesAttempted: selected.length, selectedIds: [...selectedIds], synthetic: true },
    model: process.env.OPENAI_EXTRACTION_MODEL ?? null,
    invoice: { status: { ready: 0, needsConfirmation: 0, error: 0 }, fields: { correct: 0, total: 0 } },
    agreement: { status: { ready: 0, needsConfirmation: 0, error: 0 }, fields: { correct: 0, total: 0 } },
    totalCalls: 0,
    results: [],
    scope: [
      "Actual configured extraction model called on raw synthetic text, once per invoice and supplier promise.",
      "Five selected fields per document are compared against manually confirmed fixture facts; errors count as incorrect fields.",
      "Ready and needs-confirmation results both contribute field comparisons, while status counts show whether merchant confirmation remains required.",
      "This sample does not test image/PDF extraction, receiving parsing, all 25 cases unless selected, or end-to-end claim and recovery behavior.",
    ],
  };

  for (const fixture of selected) {
    const [invoice, agreement] = await Promise.all([
      extractInvoice(input(fixture, "invoice")),
      extractAgreement(input(fixture, "agreement")),
    ]);
    report.totalCalls += 2;
    const invoiceResult = summarize(invoice, invoiceChecks(invoice, fixture));
    const agreementResult = summarize(agreement, agreementChecks(agreement, fixture));
    recordStatus(report.invoice.status, invoiceResult.status);
    recordStatus(report.agreement.status, agreementResult.status);
    report.invoice.fields.correct += invoiceResult.fields.correct;
    report.invoice.fields.total += invoiceResult.fields.total;
    report.agreement.fields.correct += agreementResult.fields.correct;
    report.agreement.fields.total += agreementResult.fields.total;
    report.results.push({ caseId: fixture.id, invoice: invoiceResult, agreement: agreementResult });
  }
  return report;
}
