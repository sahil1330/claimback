import { z } from "zod";
import fullAccept from "../../../fixtures/scenarios/full-accept.json";
import goldenPath from "../../../fixtures/scenarios/golden-path.json";
import noResponse from "../../../fixtures/scenarios/no-response.json";
import rateRejection from "../../../fixtures/scenarios/rate-rejection.json";
import replacement from "../../../fixtures/scenarios/replacement.json";
import unresolved from "../../../fixtures/scenarios/unresolved.json";

export const supplierScenarioIdSchema = z.enum([
  "golden_partial_credit",
  "full_accept",
  "reject_rate",
  "replacement",
  "unresolved",
  "no_response",
]);

export const supplierScenarioStepSchema = z.enum([
  "golden_partial_credit",
  "golden_rate_credit_promise",
  "full_credit_promise",
  "reject_rate",
  "rate_follow_up",
  "replacement_promise",
  "unresolved",
]);

export const supplierScenarioSchema = z.object({
  id: supplierScenarioIdSchema,
  name: z.string().min(1),
  steps: z.array(supplierScenarioStepSchema),
});

export type SupplierScenarioId = z.infer<typeof supplierScenarioIdSchema>;
export type SupplierScenarioStep = z.infer<typeof supplierScenarioStepSchema>;
export type SupplierScenario = z.infer<typeof supplierScenarioSchema>;

const scenarioFixtures = [
  goldenPath,
  fullAccept,
  rateRejection,
  replacement,
  unresolved,
  noResponse,
];

const scenarioMap = new Map<SupplierScenarioId, SupplierScenario>();
for (const fixture of scenarioFixtures) {
  const scenario = supplierScenarioSchema.parse(fixture);
  if (scenarioMap.has(scenario.id)) {
    throw new Error(`Duplicate supplier scenario: ${scenario.id}`);
  }
  scenarioMap.set(scenario.id, scenario);
}

/** The fixture list is also the public set of selectable demo scenarios. */
export const supplierScenarios = Object.freeze([...scenarioMap.values()]);

export function getSupplierScenario(id: string): SupplierScenario {
  const parsedId = supplierScenarioIdSchema.parse(id);
  const scenario = scenarioMap.get(parsedId);
  if (!scenario) throw new Error(`Missing supplier scenario fixture: ${parsedId}`);
  return scenario;
}
