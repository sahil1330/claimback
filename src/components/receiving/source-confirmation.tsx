"use client";

import { useState } from "react";
import { Check, ExternalLink, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AgreementFacts, ConfirmationRequest, InvoiceFacts } from "@/types/domain";
import { parseRupeesToPaise } from "./source-confirmation-values";

export type SourceConfirmationSubmission = {
  acknowledgments: Array<{ field: string; reason: string }>;
  corrections: Record<string, string | number | { buyQuantity: number; freeQuantity: number } | null>;
};

type Props = {
  caseId: string;
  label: string;
  facts: InvoiceFacts | AgreementFacts;
  confirmations: ConfirmationRequest[];
  busy: boolean;
  onSubmit: (submission: SourceConfirmationSubmission) => Promise<void>;
};

const lineFieldNames: Record<string, string> = {
  rawName: "Product name", skuRef: "SKU", unit: "Unit", packSize: "Pack size",
  quantity: "Quantity", unitPricePaise: "Unit rate (₹)",
  discountPaise: "Discount (₹)",
  "scheme.buyQuantity": "Scheme buy quantity", "scheme.freeQuantity": "Scheme free quantity",
  "source.locator": "Source location (page or row)",
};

function canonicalField(field: string) {
  return field.replace(/\.unitPriceText$/, ".unitPricePaise").replace(/\.discountText$/, ".discountPaise");
}

function valueAt(facts: InvoiceFacts | AgreementFacts, field: string): unknown {
  let value: unknown = facts;
  for (const part of field.split(".")) {
    if (typeof value !== "object" || value === null || !(part in value)) return null;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

function isMoney(field: string) { return /\.(unitPricePaise|discountPaise)$/.test(field); }
function isCount(field: string) { return /\.(quantity|buyQuantity|freeQuantity)$/.test(field); }

function initialValue(facts: InvoiceFacts | AgreementFacts, field: string) {
  const value = valueAt(facts, field);
  if (value === null || value === undefined) return "";
  if (isMoney(field) && typeof value === "number") {
    return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
  }
  return String(value);
}

function fieldLabel(field: string) {
  const line = /^lines\.(\d+)(?:\.(.*))?$/.exec(field);
  if (line) return `Product ${Number(line[1]) + 1}${line[2] ? ` · ${lineFieldNames[line[2]] ?? line[2]}` : ""}`;
  return ({ invoiceNumber: "Invoice number", supplierName: "Supplier name", promiseText: "Supplier promise", lines: "Product lines" } as Record<string, string>)[field] ?? field;
}

function parseValue(field: string, raw: string): string | number | null | undefined {
  const value = raw.trim();
  if (!value) return null;
  if (isMoney(field)) return parseRupeesToPaise(value) ?? undefined;
  if (isCount(field)) return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) &&
    (!/\.(buyQuantity|freeQuantity)$/.test(field) || Number(value) > 0) ? Number(value) : undefined;
  return value.length <= 4000 ? value : undefined;
}

function editablePaths(facts: InvoiceFacts | AgreementFacts, confirmations: ConfirmationRequest[]) {
  const paths = new Set<string>();
  for (const { field } of confirmations) {
    const canonical = canonicalField(field);
    if (["invoiceNumber", "supplierName", "promiseText"].includes(canonical) ||
      /^lines\.\d+\.(rawName|skuRef|unit|packSize|quantity|unitPricePaise|discountPaise)$/.test(canonical)) {
      paths.add(canonical);
    }
    const scheme = /^(lines\.\d+)\.scheme(?:\.(?:buyQuantity|freeQuantity))?$/.exec(canonical);
    if (scheme) {
      paths.add(`${scheme[1]}.scheme.buyQuantity`);
      paths.add(`${scheme[1]}.scheme.freeQuantity`);
    }
    const genericLine = /^lines\.(\d+)$/.exec(field);
    if (genericLine && facts.lines[Number(genericLine[1])]) {
      for (const name of ["rawName", "skuRef", "unit", "packSize", "quantity", "unitPricePaise", "discountPaise"]) paths.add(`${field}.${name}`);
      if ("scheme" in facts.lines[Number(genericLine[1])] && valueAt(facts, `${field}.scheme`)) {
        paths.add(`${field}.scheme.buyQuantity`);
        paths.add(`${field}.scheme.freeQuantity`);
      }
    }
    if (/^lines\.\d+\.source$/.test(field)) paths.add(`${field}.locator`);
  }
  return Array.from(paths);
}

/** The form exposes only fields flagged by extraction, plus a flagged line's own scalar facts. */
export function SourceConfirmation({ caseId, label, facts, confirmations, busy, onSubmit }: Props) {
  const paths = editablePaths(facts, confirmations);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(paths.map((path) => [path, initialValue(facts, path)])));
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const missingLines = confirmations.some((item) => item.field === "lines" || /^lines\.\d+$/.test(item.field) && !facts.lines[Number(item.field.split(".")[1])]);
  const missingLocator = confirmations.some((item) => /^lines\.\d+\.source$/.test(item.field) && !item.source.excerpt && !values[`${item.field}.locator`]?.trim());
  const invalidPaths = paths.filter((path) => parseValue(path, values[path] ?? "") === undefined ||
    (/(\.quantity|\.unitPricePaise|\.rawName)$/.test(path) && !values[path]?.trim()) ||
    (path === "supplierName" && !values[path]?.trim()));
  const schemeBases = Array.from(new Set(paths.filter((path) => /\.scheme\.(buyQuantity|freeQuantity)$/.test(path)).map((path) => path.replace(/\.(buyQuantity|freeQuantity)$/, ""))));
  const incompleteScheme = schemeBases.some((base) => Boolean(values[`${base}.buyQuantity`]?.trim()) !== Boolean(values[`${base}.freeQuantity`]?.trim()));
  const ready = !missingLines && !missingLocator && !incompleteScheme && confirmations.length > 0 && invalidPaths.length === 0 && confirmations.every((_, index) => checked[index]);

  async function submit() {
    if (!ready) return;
    setError(null);
    try {
      const corrections: SourceConfirmationSubmission["corrections"] = {};
      for (const path of paths) {
        if (/\.scheme\.(buyQuantity|freeQuantity)$/.test(path)) continue;
        const parsed = parseValue(path, values[path] ?? "");
        if (parsed !== valueAt(facts, path) && parsed !== undefined) corrections[path] = parsed;
      }
      for (const base of schemeBases) {
        const buy = parseValue(`${base}.buyQuantity`, values[`${base}.buyQuantity`] ?? "");
        const free = parseValue(`${base}.freeQuantity`, values[`${base}.freeQuantity`] ?? "");
        const old = valueAt(facts, base);
        if (buy === null && free === null && old !== null) corrections[base] = null;
        if (typeof buy === "number" && typeof free === "number" &&
          (buy !== valueAt(facts, `${base}.buyQuantity`) || free !== valueAt(facts, `${base}.freeQuantity`))) {
          corrections[base] = { buyQuantity: buy, freeQuantity: free };
        }
      }
      await onSubmit({
        acknowledgments: confirmations.map(({ field, reason }) => ({ field, reason })),
        corrections,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save these corrections. Check the fields and retry.");
    }
  }

  return <div className="rounded-xl border border-warning/30 bg-warning-soft/50 p-4 text-sm" aria-label={`${label} source confirmation`}>
    <h3 className="font-semibold text-foreground">Review uncertain {label.toLowerCase()} facts</h3>
    <p className="mt-1 text-xs leading-5 text-muted">Compare each flagged fact with the original evidence. Edit only the fields below, then confirm every warning.</p>
    <div className="mt-4 space-y-3">
      {confirmations.map((item, index) => <div key={`${item.field}-${item.reason}-${index}`} className="rounded-lg border border-border bg-surface p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-xs font-semibold text-foreground">{fieldLabel(item.field)}</strong><a className="inline-flex items-center gap-1 text-xs font-semibold text-primary underline-offset-2 hover:underline" href={`/api/evidence?caseId=${encodeURIComponent(caseId)}&artifactId=${encodeURIComponent(item.source.sourceArtifactId)}`} target="_blank" rel="noopener noreferrer">View original <ExternalLink className="size-3" aria-hidden="true" /></a></div>
        <p className="mt-1 text-xs text-warning">{item.reason}</p>
        {(item.source.excerpt || item.source.locator) && <p className="mt-2 rounded-md bg-muted/10 px-2 py-1.5 font-mono text-[11px] leading-5 text-muted">{item.source.excerpt || item.source.locator}</p>}
        <label className="mt-3 flex items-start gap-2 text-xs leading-5 text-foreground"><input type="checkbox" className="mt-1 accent-primary" checked={Boolean(checked[index])} onChange={(event) => setChecked((current) => ({ ...current, [index]: event.target.checked }))} />I checked this warning against the original evidence.</label>
      </div>)}
    </div>
    {paths.length > 0 && <div className="mt-4 rounded-lg border border-border bg-surface p-3"><p className="text-xs font-semibold text-foreground">Correct flagged facts</p><div className="mt-3 grid gap-3 sm:grid-cols-2">
      {paths.map((path) => <label key={path} className="block text-xs font-semibold text-foreground">{fieldLabel(path)}
        <input className={`mt-1 min-h-11 w-full rounded-lg border bg-surface px-3 text-sm font-normal text-foreground focus:border-primary focus:outline-none ${invalidPaths.includes(path) ? "border-danger" : "border-border"}`} aria-invalid={invalidPaths.includes(path)} inputMode={isMoney(path) ? "decimal" : isCount(path) ? "numeric" : "text"} value={values[path] ?? ""} onChange={(event) => { setValues((current) => ({ ...current, [path]: event.target.value })); setChecked({}); }} placeholder={isMoney(path) ? "0.00" : path.endsWith(".source.locator") ? "e.g. page 1, row 2" : "Enter value visible in the source"} />
        {isMoney(path) && <span className="mt-1 block font-normal text-muted">Rupees; saved as integer paise.</span>}
      </label>)}
    </div></div>}
    {missingLines && <p role="alert" className="mt-3 rounded-lg bg-danger-soft p-2 text-xs text-danger">No product line was readable. Upload clearer evidence before continuing.</p>}
    {missingLocator && <p role="alert" className="mt-3 rounded-lg bg-danger-soft p-2 text-xs text-danger">Give this fact a location in the original evidence, or upload a clearer document.</p>}
    {invalidPaths.length > 0 && <p role="alert" className="mt-3 rounded-lg bg-danger-soft p-2 text-xs text-danger">Check the highlighted values. Quantities need whole numbers; rupee amounts allow two decimal places.</p>}
    {incompleteScheme && <p role="alert" className="mt-3 rounded-lg bg-danger-soft p-2 text-xs text-danger">Enter both scheme quantities, or leave both empty if the original evidence shows no scheme.</p>}
    {error && <p role="alert" className="mt-3 rounded-lg bg-danger-soft p-2 text-xs text-danger">{error}</p>}
    <div className="mt-4"><Button type="button" disabled={!ready || busy} onClick={() => { void submit(); }}>{busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}Save confirmed source facts</Button></div>
  </div>;
}
