/** Product identity hints extracted from an invoice, agreement, or receiving note. */
export type SkuInput = {
  rawName: string;
  skuCode?: string | null;
  /** Quantity unit, such as box, carton, or piece. */
  unit?: string | null;
  /** Product pack detail, such as 70g x 96 or 100ml. */
  packSize?: string | null;
};

export type SkuCandidateInput = SkuInput & { id: string };

export type SkuMatchReason =
  | "sku_code_exact"
  | "sku_code_conflict"
  | "sku_code_missing"
  | "name_exact"
  | "name_partial"
  | "name_no_overlap"
  | "pack_exact"
  | "pack_conflict"
  | "pack_missing"
  | "unit_exact"
  | "unit_conflict"
  | "unit_missing";

export type ScoredSkuCandidate = {
  candidate: SkuCandidateInput;
  /** Ranking aid only. It is not a model confidence or probability. */
  score: number;
  strength: "strong" | "possible" | "blocked";
  reasons: SkuMatchReason[];
};

export type SkuMatchResult =
  | {
      status: "matched";
      match: ScoredSkuCandidate;
      candidates: ScoredSkuCandidate[];
    }
  | {
      status: "ambiguous" | "unmatched";
      match: null;
      candidates: ScoredSkuCandidate[];
    };

const packPattern =
  /\d+(?:[.,]\d+)?\s*(?:kilograms?|kg|grams?|gm|g|millilit(?:res|ers)?|ml|lit(?:res|ers)?|l)(?:\s*[x×*]\s*\d+)?/giu;

const packUnits: Record<string, string> = {
  kilogram: "kg",
  kilograms: "kg",
  gram: "g",
  grams: "g",
  gm: "g",
  millilitre: "ml",
  millilitres: "ml",
  milliliter: "ml",
  milliliters: "ml",
  litre: "l",
  litres: "l",
  liter: "l",
  liters: "l",
};

const quantityUnits: Record<string, string> = {
  boxes: "box",
  cartons: "carton",
  cases: "case",
  packets: "packet",
  packs: "pack",
  pieces: "piece",
  pcs: "piece",
  pc: "piece",
  units: "unit",
  bottles: "bottle",
  strips: "strip",
};

function textTokens(value: string): string[] {
  return value.normalize("NFKC").toLocaleLowerCase("en-IN")
    .match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
}

function normalizeCode(value: string | null | undefined): string | null {
  const code = value?.normalize("NFKC").trim().toUpperCase();
  // Keep internal punctuation: AB-12 and AB12 may identify different products.
  return code || null;
}

function normalizeUnit(value: string | null | undefined): string | null {
  const unit = value ? textTokens(value).join(" ") : "";
  return unit ? quantityUnits[unit] ?? unit : null;
}

function normalizePack(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const compact = value.normalize("NFKC").toLocaleLowerCase("en-IN")
    .replace(/\s+/g, "").replace(/[×*]/g, "x").replace(",", ".");
  const match = compact.match(/^(\d+(?:\.\d+)?)([a-z]+)(?:x(\d+))?$/);
  if (!match) return compact;
  const unit = packUnits[match[2]] ?? match[2];
  return `${match[1]}${unit}${match[3] ? `x${match[3]}` : ""}`;
}

function packFromName(rawName: string): string | null {
  const packs = rawName.normalize("NFKC").match(packPattern);
  return packs?.length === 1 ? normalizePack(packs[0]) : null;
}

/** Removes explicit pack notation while retaining product and variant words. */
export function normalizeSkuName(rawName: string): string {
  return textTokens(rawName.replace(packPattern, " ")).join(" ");
}

type SkuProfile = {
  name: string;
  tokens: Set<string>;
  code: string | null;
  unit: string | null;
  pack: string | null;
};

function profile(input: SkuInput): SkuProfile {
  const name = normalizeSkuName(input.rawName);
  return {
    name,
    tokens: new Set(name.split(" ").filter(Boolean)),
    code: normalizeCode(input.skuCode),
    unit: normalizeUnit(input.unit),
    pack: normalizePack(input.packSize) ?? packFromName(input.rawName),
  };
}

function nameOverlap(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let common = 0;
  for (const token of left) if (right.has(token)) common++;
  return common / (left.size + right.size - common);
}

function scoreCandidate(
  query: SkuProfile,
  candidate: SkuCandidateInput,
): ScoredSkuCandidate {
  const target = profile(candidate);
  const reasons: SkuMatchReason[] = [];
  let blocked = false;
  let missingDetail = false;
  let score = 0;

  const exactCode = Boolean(query.code && target.code && query.code === target.code);
  if (query.code && target.code) {
    reasons.push(exactCode ? "sku_code_exact" : "sku_code_conflict");
    if (exactCode) score += 30;
    else blocked = true;
  } else if (query.code && !target.code) {
    reasons.push("sku_code_missing");
    missingDetail = true;
  }

  const overlap = nameOverlap(query.tokens, target.tokens);
  const exactName = Boolean(query.name && target.name &&
    query.name.split(" ").sort().join(" ") ===
      target.name.split(" ").sort().join(" "));
  if (exactName) {
    reasons.push("name_exact");
    score += 70;
  } else if (overlap > 0) {
    reasons.push("name_partial");
    score += Math.round(overlap * 60);
  } else if (query.name && target.name) {
    reasons.push("name_no_overlap");
  }

  for (const [kind, left, right] of [
    ["pack", query.pack, target.pack],
    ["unit", query.unit, target.unit],
  ] as const) {
    if (left && right) {
      if (left === right) {
        reasons.push(kind === "pack" ? "pack_exact" : "unit_exact");
        score += kind === "pack" ? 15 : 10;
      } else {
        reasons.push(kind === "pack" ? "pack_conflict" : "unit_conflict");
        blocked = true;
      }
    } else if (left || right) {
      reasons.push(kind === "pack" ? "pack_missing" : "unit_missing");
      missingDetail = true;
    }
  }

  const plausible = exactCode || overlap >= 0.5;
  const strong = exactCode
    ? (!query.name || !target.name || overlap > 0)
    : exactName && !missingDetail;
  const strength = blocked || !plausible
    ? "blocked"
    : strong ? "strong" : "possible";

  return {
    candidate,
    score: blocked ? 0 : Math.min(score, 100),
    strength,
    reasons,
  };
}

/**
 * Matches only when one candidate has a reliable identity. Partial names,
 * unknown pack details, and equally plausible products require confirmation.
 */
export function matchSku(
  query: SkuInput,
  candidates: readonly SkuCandidateInput[],
): SkuMatchResult {
  const queryProfile = profile(query);
  const ranked = candidates.map((candidate) => scoreCandidate(queryProfile, candidate))
    .sort((left, right) => right.score - left.score ||
      left.candidate.id.localeCompare(right.candidate.id));
  const viable = ranked.filter((candidate) => candidate.strength !== "blocked");
  const strong = viable.filter((candidate) => candidate.strength === "strong");

  if (strong.length === 1) {
    const selected = strong[0];
    const sameIdentity = viable.some((other) => other !== selected && (
      (selected.reasons.includes("sku_code_exact") && other.reasons.includes("sku_code_exact")) ||
      (selected.reasons.includes("name_exact") && other.reasons.includes("name_exact"))
    ));
    if (!sameIdentity) {
      return { status: "matched", match: selected, candidates: ranked };
    }
  }

  return {
    status: viable.length ? "ambiguous" : "unmatched",
    match: null,
    candidates: ranked,
  };
}
