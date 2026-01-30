import type { MinoPage, MinoResult } from "./mino";

const RULE_KEYWORDS = [
  "eligible",
  "eligibility",
  "requirement",
  "requirements",
  "must",
  "must be",
  "at least",
  "minimum",
  "maximum",
  "not eligible",
  "ineligible",
  "excluded",
  "exclusion",
  "only",
  "age",
  "income",
  "resident",
  "citizen",
  "student",
];

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function hasKeyword(line: string): boolean {
  const lower = line.toLowerCase();
  return RULE_KEYWORDS.some((keyword) => lower.includes(keyword));
}

type PageInput = MinoResult | { pages: MinoPage[] } | MinoPage[];

function normalizePages(input: PageInput): MinoPage[] {
  if (Array.isArray(input)) {
    return input;
  }
  if (input && typeof input === "object" && Array.isArray(input.pages)) {
    return input.pages;
  }
  return [];
}

export function extractRules(pages: PageInput): string[] {
  const rules = new Set<string>();

  for (const page of normalizePages(pages)) {
    const lines = page.text.split(/\r?\n/);
    for (const rawLine of lines) {
      const normalized = normalizeLine(rawLine);
      if (!normalized || normalized.length < 8) continue;
      if (!hasKeyword(normalized)) continue;
      if (normalized.length > 280) continue;
      rules.add(normalized);
    }
  }

  return Array.from(rules);
}
