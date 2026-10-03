import "server-only";
import { openai } from "@ai-sdk/openai";

export class ModelConfigurationError extends Error {
  constructor(variable: "OPENAI_AGENT_MODEL" | "OPENAI_EXTRACTION_MODEL" | "OPENAI_API_KEY") {
    super(`${variable} is required for AI extraction`);
    this.name = "ModelConfigurationError";
  }
}

function configuredModel(variable: "OPENAI_AGENT_MODEL" | "OPENAI_EXTRACTION_MODEL") {
  if (!process.env.OPENAI_API_KEY) {
    throw new ModelConfigurationError("OPENAI_API_KEY");
  }
  const modelId = process.env[variable]?.trim();
  if (!modelId) {
    throw new ModelConfigurationError(variable);
  }
  return openai(modelId);
}

export function extractionModel() {
  return configuredModel("OPENAI_EXTRACTION_MODEL");
}

export function agentModel() {
  return configuredModel("OPENAI_AGENT_MODEL");
}
