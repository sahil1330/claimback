import { createHash } from "node:crypto";
import { z } from "zod";
import { reconcileCase, type ReconciliationGroup } from "../reconciliation/engine";
import { agreementFactsSchema, invoiceFactsSchema } from "../../types/domain";

type SeedCase = {
  key: string; title: string; sku: string; supplier: 0 | 1; invoiceNumber: string;
  quantity: number; receivedQuantity: number; receivedFreeQuantity: number | null;
  damagedQuantity: number; agreedRatePaise: number; billedRatePaise: number;
  scheme: { buyQuantity: number; freeQuantity: number } | null;
  stage: "resolved" | "awaiting_recovery" | "awaiting_approval";
  expectedRecoveryPaise: number;
  createdAt: string; resolvedAt?: string;
};

const CASES: readonly SeedCase[] = [
  { key: "short-resolved", title: "Recovered short delivery · Demo history", sku: "MED-A", supplier: 0,
    invoiceNumber: "SM-1001", quantity: 20, receivedQuantity: 10, receivedFreeQuantity: null,
    damagedQuantity: 0, agreedRatePaise: 30000, billedRatePaise: 30000, scheme: null,
    stage: "resolved", expectedRecoveryPaise: 300000,
    createdAt: "2026-09-02T09:00:00.000Z", resolvedAt: "2026-09-08T12:00:00.000Z" },
  { key: "rate-resolved", title: "Recovered rate mismatch · Demo history", sku: "MED-B", supplier: 0,
    invoiceNumber: "SM-1014", quantity: 29, receivedQuantity: 29, receivedFreeQuantity: null,
    damagedQuantity: 0, agreedRatePaise: 40000, billedRatePaise: 54000, scheme: null,
    stage: "resolved", expectedRecoveryPaise: 406000,
    createdAt: "2026-09-12T09:00:00.000Z", resolvedAt: "2026-09-17T12:00:00.000Z" },
  { key: "damage-resolved", title: "Recovered damaged stock · Demo history", sku: "MED-C", supplier: 1,
    invoiceNumber: "NP-2044", quantity: 20, receivedQuantity: 20, receivedFreeQuantity: null,
    damagedQuantity: 10, agreedRatePaise: 38000, billedRatePaise: 38000, scheme: null,
    stage: "resolved", expectedRecoveryPaise: 380000,
    createdAt: "2026-09-20T09:00:00.000Z", resolvedAt: "2026-09-25T12:00:00.000Z" },
  { key: "scheme-pending", title: "Next-invoice scheme credit · Demo history", sku: "MED-D", supplier: 0,
    invoiceNumber: "SM-1058", quantity: 30, receivedQuantity: 30, receivedFreeQuantity: 1,
    damagedQuantity: 0, agreedRatePaise: 78000, billedRatePaise: 78000,
    scheme: { buyQuantity: 10, freeQuantity: 1 }, stage: "awaiting_recovery",
    expectedRecoveryPaise: 156000, createdAt: "2026-09-29T09:00:00.000Z" },
  { key: "short-awaiting", title: "Short delivery awaiting approval · Demo history", sku: "MED-E", supplier: 1,
    invoiceNumber: "NP-2060", quantity: 10, receivedQuantity: 5, receivedFreeQuantity: null,
    damagedQuantity: 0, agreedRatePaise: 13000, billedRatePaise: 13000, scheme: null,
    stage: "awaiting_approval", expectedRecoveryPaise: 65000,
    createdAt: "2026-10-01T09:00:00.000Z" },
  { key: "rate-awaiting", title: "Rate mismatch awaiting approval · Demo history", sku: "MED-F", supplier: 1,
    invoiceNumber: "NP-2062", quantity: 10, receivedQuantity: 10, receivedFreeQuantity: null,
    damagedQuantity: 0, agreedRatePaise: 10000, billedRatePaise: 14200, scheme: null,
    stage: "awaiting_approval", expectedRecoveryPaise: 42000,
    createdAt: "2026-10-02T09:00:00.000Z" },
];

export function stableDemoId(userId: string, label: string) {
  z.uuid().parse(userId);
  const hex = createHash("sha256").update(`claimback:reset:${userId}:${label}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function rupees(paise: number) {
  const value = BigInt(paise);
  return `₹${value / BigInt(100)}.${(value % BigInt(100)).toString().padStart(2, "0")}`;
}

export function buildDemoResetPlan(userId: string) {
  z.uuid().parse(userId);
  const suppliers = [
    { id: stableDemoId(userId, "supplier:sharma"), user_id: userId, name: "Sharma Pharma Distributors" },
    { id: stableDemoId(userId, "supplier:nova"), user_id: userId, name: "Nova Medical Supply" },
  ];
  const cases = [] as Record<string, unknown>[];
  const artifacts = [] as Record<string, unknown>[];
  const files = [] as { path: string; text: string }[];
  const obligations = [] as Record<string, unknown>[];
  const verifications = [] as Record<string, unknown>[];
  const supplierMessages = [] as Record<string, unknown>[];
  const events = [] as Record<string, unknown>[];

  for (const fixture of CASES) {
    const caseId = stableDemoId(userId, `case:${fixture.key}`);
    const agreementId = stableDemoId(userId, `agreement:${fixture.key}`);
    const invoiceId = stableDemoId(userId, `invoice:${fixture.key}`);
    const agreementText = `${fixture.sku}: ${fixture.quantity} boxes at ${rupees(fixture.agreedRatePaise)}${fixture.scheme ? `, buy ${fixture.scheme.buyQuantity} get ${fixture.scheme.freeQuantity} free` : ""}. Supplier agreement.`;
    const invoiceText = `Invoice ${fixture.invoiceNumber}: ${fixture.sku}, ${fixture.quantity} boxes at ${rupees(fixture.billedRatePaise)}.`;
    const receivedText = `${fixture.sku}: ${fixture.receivedQuantity} paid boxes, ${fixture.receivedFreeQuantity ?? 0} free boxes, ${fixture.damagedQuantity} damaged. Merchant confirmed.`;
    const source = (sourceArtifactId: string, sourceLabel: string, excerpt: string, locator: string) =>
      ({ sourceArtifactId, sourceLabel, excerpt, locator });
    const common = { rawName: fixture.sku, skuRef: fixture.sku, unit: "boxes", packSize: null,
      confidence: "high" as const, uncertainties: [] };
    const promised = { ...common, quantity: fixture.quantity,
      unitPricePaise: fixture.agreedRatePaise, discountPaise: null, scheme: fixture.scheme,
      source: source(agreementId, "Supplier agreement", agreementText, "text line 1") };
    const billed = { ...common, quantity: fixture.quantity,
      unitPricePaise: fixture.billedRatePaise, discountPaise: null,
      source: source(invoiceId, `Invoice ${fixture.invoiceNumber}`, invoiceText, "text line 1") };
    const received = { ...common, receivedQuantity: fixture.receivedQuantity,
      receivedFreeQuantity: fixture.receivedFreeQuantity, damagedQuantity: fixture.damagedQuantity,
      merchantConfirmed: true,
      source: source(caseId, "Merchant-confirmed receiving input", receivedText, "receiving form") };
    const group: ReconciliationGroup = { skuRef: fixture.sku, matchStatus: "matched",
      promised, billed, received };
    const result = reconcileCase({ groups: [group] });
    if (result.outcome !== "discrepancy" || result.totalPotentialRecoveryPaise !== fixture.expectedRecoveryPaise) {
      throw new Error(`Demo fixture ${fixture.key} does not reconcile to its expected amount`);
    }
    const approvedAt = fixture.stage === "awaiting_approval" ? null
      : new Date(Date.parse(fixture.createdAt) + 3_600_000).toISOString();
    const sentAt = fixture.stage === "awaiting_approval" ? null
      : new Date(Date.parse(fixture.createdAt) + 3_900_000).toISOString();
    const status = fixture.stage === "resolved" ? "RESOLVED"
      : fixture.stage === "awaiting_recovery" ? "AWAITING_RECOVERY" : "AWAITING_MERCHANT_APPROVAL";
    cases.push({ id: caseId, user_id: userId, supplier_id: suppliers[fixture.supplier].id,
      status, title: fixture.title,
      promised: { lines: [promised] }, billed: { lines: [billed] },
      received: { lines: [received], groups: [group], merchant_confirmed_at: fixture.createdAt },
      discrepancies: result.discrepancies,
      potential_recovery_paise: fixture.expectedRecoveryPaise,
      recovered_paise: fixture.stage === "resolved" ? fixture.expectedRecoveryPaise : 0,
      outstanding_paise: fixture.stage === "resolved" ? 0 : fixture.expectedRecoveryPaise,
      merchant_approved_at: approvedAt, claim_sent_at: sentAt,
      resolved_at: fixture.resolvedAt ?? null, created_at: fixture.createdAt,
      updated_at: fixture.resolvedAt ?? fixture.createdAt });

    const agreementFacts = agreementFactsSchema.parse({ supplierName: suppliers[fixture.supplier].name,
      promiseText: agreementText, source: promised.source, lines: [promised], uncertainties: [] });
    const invoiceFacts = invoiceFactsSchema.parse({ invoiceNumber: fixture.invoiceNumber,
      supplierName: suppliers[fixture.supplier].name, source: billed.source, lines: [billed], uncertainties: [] });
    for (const item of [
      { id: agreementId, type: "agreement", name: "agreement.txt", text: agreementText,
        extracted: { status: "ready", facts: agreementFacts, confirmations: [] } },
      { id: invoiceId, type: "invoice", name: "invoice.txt", text: invoiceText,
        extracted: { status: "ready", facts: invoiceFacts, confirmations: [] } },
    ]) {
      const path = `${userId}/${caseId}/${item.id}-${item.name}`;
      files.push({ path, text: item.text });
      artifacts.push({ id: item.id, user_id: userId, case_id: caseId, type: item.type,
        storage_path: path, mime_type: "text/plain", original_name: item.name,
        extracted: item.extracted, extraction_status: "complete" });
    }

    if (fixture.stage !== "awaiting_approval") {
      const obligationId = stableDemoId(userId, `obligation:${fixture.key}`);
      obligations.push({ id: obligationId, user_id: userId, case_id: caseId,
        supplier_id: suppliers[fixture.supplier].id,
        original_amount_paise: fixture.expectedRecoveryPaise,
        recovered_paise: fixture.stage === "resolved" ? fixture.expectedRecoveryPaise : 0,
        outstanding_paise: fixture.stage === "resolved" ? 0 : fixture.expectedRecoveryPaise,
        promise_text: `We will credit ${rupees(fixture.expectedRecoveryPaise)} on the next invoice.`,
        promised_for: "next invoice", status: fixture.stage === "resolved" ? "RECOVERED" : "OPEN",
        created_at: sentAt, resolved_at: fixture.resolvedAt ?? null });
      supplierMessages.push({ id: caseId, user_id: userId, case_id: caseId,
        direction: "outbound", body: `Please credit ${rupees(fixture.expectedRecoveryPaise)} for invoice ${fixture.invoiceNumber}.`,
        source: "demo_claim_transport", created_at: sentAt });
      if (fixture.stage === "resolved") {
        const creditId = stableDemoId(userId, `credit:${fixture.key}`);
        const creditText = `CREDIT NOTE for invoice ${fixture.invoiceNumber}. Total credit: ${rupees(fixture.expectedRecoveryPaise)}. Posted to account.`;
        const path = `${userId}/${caseId}/${creditId}-credit-note.txt`;
        files.push({ path, text: creditText });
        artifacts.push({ id: creditId, user_id: userId, case_id: caseId,
          type: "credit_note", storage_path: path, mime_type: "text/plain",
          original_name: "credit-note.txt", extraction_status: "complete",
          extracted: { status: "ready", evidence: {
            source: source(creditId, "Credit note", creditText, "text line 1"),
            explicitAmountPaise: fixture.expectedRecoveryPaise,
            referenceText: fixture.invoiceNumber, evidenceType: "credit_note", uncertainties: [],
          } } });
        verifications.push({ artifact_id: creditId, case_id: caseId, user_id: userId,
          credit_paise: fixture.expectedRecoveryPaise, applied_paise: fixture.expectedRecoveryPaise,
          evidence: { source: source(creditId, "Credit note", creditText, "text line 1"),
            explicitAmountPaise: fixture.expectedRecoveryPaise, referenceText: fixture.invoiceNumber,
            evidenceType: "credit_note", uncertainties: [],
            linkage: { originalInvoiceNumber: fixture.invoiceNumber, method: "document_reference" } },
          allocations: [{ id: obligationId, appliedPaise: fixture.expectedRecoveryPaise }],
          outcome: "full", created_at: fixture.resolvedAt });
      } else {
        const inboundId = stableDemoId(userId, `supplier-reply:${fixture.key}`);
        const reply = `We accept the missing free units. We will credit ${rupees(fixture.expectedRecoveryPaise)} on your next invoice.`;
        supplierMessages.push({ id: inboundId, user_id: userId, case_id: caseId,
          direction: "inbound", body: reply, source: "demo_supplier:full_accept",
          created_at: new Date(Date.parse(fixture.createdAt) + 7_200_000).toISOString(),
          parsed: { scenarioId: "full_accept", responseKind: "full_credit_promised",
            appliedAt: new Date(Date.parse(fixture.createdAt) + 7_200_000).toISOString(),
            analysis: { sourceMessageId: inboundId, rawBody: reply, needsConfirmation: false,
              uncertainties: [], decisions: [{ discrepancyId: result.discrepancies[0].id,
                outcome: "promise_credit", sourceExcerpt: reply,
                supplierAcknowledgedPaise: fixture.expectedRecoveryPaise, amountBasis: "explicit",
                coverage: "full", promisedForText: "next invoice", uncertainty: null }] } } });
      }
    }
    const event = (eventType: string, summary: string, createdAt: string) => ({
      user_id: userId, case_id: caseId, event_type: eventType,
      payload: { summary, status: "success", details: { syntheticDemoHistory: true } },
      created_at: createdAt,
    });
    events.push(event("demo_history_restored", "Synthetic demo history restored", fixture.createdAt));
    events.push(event("evidence_captured", "Invoice and supplier promise understood", fixture.createdAt));
    events.push(event("discrepancy_found", "Evidence-grounded discrepancy found",
      new Date(Date.parse(fixture.createdAt) + 1_800_000).toISOString()));
    if (approvedAt && sentAt) {
      events.push(event("merchant_approved", "Merchant approved claim", approvedAt));
      events.push(event("claim_sent", "Claim sent through demo supplier transport", sentAt));
    }
    if (fixture.stage === "awaiting_recovery") {
      events.push(event("supplier_response_received", "Supplier promised credit on a later invoice",
        new Date(Date.parse(fixture.createdAt) + 7_200_000).toISOString()));
      events.push(event("recovery_outstanding", "Credit remains outstanding until verified",
        new Date(Date.parse(fixture.createdAt) + 7_200_001).toISOString()));
    }
    if (fixture.resolvedAt) {
      events.push(event("credit_verified", "Posted credit verified against original invoice", fixture.resolvedAt));
      events.push(event("case_resolved", "Recovery verified and case closed",
        new Date(Date.parse(fixture.resolvedAt) + 1).toISOString()));
    }
  }
  return {
    suppliers, cases, artifacts, files, obligations, verifications, supplierMessages, events,
    summary: { businessName: "Sharma Medical", suppliers: 2, historicalResolvedCases: 3,
      activeObligations: 1, marginProtectedPaise: 1086000, pendingRecoveryPaise: 156000,
      openClaims: 3 },
  };
}
