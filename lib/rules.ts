import { isValid, parse, parseISO } from "date-fns";

export type UserInfo = {
  age?: number;
  studentStatus?: string;
  income?: number;
  country?: string;
};

export type RuleCheckResult = {
  reasons: Reason[];
  likelyReasons: string[];
  recommendations: string[];
};

export type Reason = {
  id: string;
  title: string;
  severity: "high" | "medium" | "low";
  explanation: string;
  recommendation: string;
  source: "rule" | "document" | "cross";
};

type RangeRule = {
  min?: number;
  max?: number;
  maxExclusive?: boolean;
};

function toNumber(value: string): number | undefined {
  const cleaned = value.replace(/,/g, "").trim();
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : undefined;
}

function normalizeCountry(input?: string): string {
  if (!input) return "";
  const lower = input.toLowerCase().replace(/\./g, "").trim();
  if (lower === "usa" || lower === "us" || lower === "united states of america") {
    return "united states";
  }
  if (lower === "uk" || lower === "u k" || lower === "united kingdom of great britain") {
    return "united kingdom";
  }
  return lower;
}

function parseAgeRule(line: string): RangeRule {
  const lower = line.toLowerCase();

  const betweenMatch = lower.match(/between\s+(\d{1,3})\s+and\s+(\d{1,3})/);
  if (betweenMatch) {
    return {
      min: toNumber(betweenMatch[1]),
      max: toNumber(betweenMatch[2]),
    };
  }

  const atLeastMatch = lower.match(/(at least|minimum age|min age)\s+(\d{1,3})/);
  if (atLeastMatch) {
    return { min: toNumber(atLeastMatch[2]) };
  }

  const plusMatch = lower.match(/(\d{1,3})\s*\+/);
  if (plusMatch) {
    return { min: toNumber(plusMatch[1]) };
  }

  const underMatch = lower.match(/(under|below|less than)\s+(\d{1,3})/);
  if (underMatch) {
    return { max: toNumber(underMatch[2]), maxExclusive: true };
  }

  const upToMatch = lower.match(/(up to|maximum age|max age|no older than)\s+(\d{1,3})/);
  if (upToMatch) {
    return { max: toNumber(upToMatch[2]) };
  }

  return {};
}

function parseIncomeRule(line: string): RangeRule {
  const lower = line.toLowerCase();
  const numbers = Array.from(lower.matchAll(/(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g))
    .map((match) => toNumber(match[1]))
    .filter((value): value is number => value !== undefined);

  if (numbers.length === 0) return {};

  if (lower.includes("between") && numbers.length >= 2) {
    return { min: numbers[0], max: numbers[1] };
  }

  if (lower.includes("at least") || lower.includes("minimum") || lower.includes("over")) {
    return { min: numbers[0] };
  }

  if (lower.includes("under") || lower.includes("below") || lower.includes("less than") || lower.includes("up to") || lower.includes("maximum")) {
    return { max: numbers[0] };
  }

  return {};
}

function detectCountryRequirement(line: string): string | undefined {
  const lower = line.toLowerCase();
  const patterns = [
    /residents?\s+of\s+([a-zA-Z\s]+)/,
    /citizens?\s+of\s+([a-zA-Z\s]+)/,
    /available\s+in\s+([a-zA-Z\s]+)/,
    /only\s+in\s+([a-zA-Z\s]+)/,
  ];

  for (const pattern of patterns) {
    const match = lower.match(pattern);
    if (match?.[1]) {
      return normalizeCountry(match[1].split(/[,.;]/)[0]);
    }
  }

  if (lower.includes("united states") || lower.includes("u s") || lower.includes("usa")) {
    return "united states";
  }
  if (lower.includes("united kingdom") || lower.includes("u k")) {
    return "united kingdom";
  }

  return undefined;
}

function includesStudentRequirement(line: string): "student" | "non-student" | undefined {
  const lower = line.toLowerCase();
  if (lower.includes("student")) {
    if (lower.includes("not a student") || lower.includes("non-student") || lower.includes("non student")) {
      return "non-student";
    }
    if (lower.includes("students only") || lower.includes("must be a student") || lower.includes("student status required") || lower.includes("student-only")) {
      return "student";
    }
  }
  return undefined;
}

function toReasonId(input: string, index: number) {
  return `${input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")}-${index}`;
}

function addReason(
  reasons: Reason[],
  seen: Set<string>,
  data: Omit<Reason, "id">
) {
  const key = `${data.title}|${data.explanation}|${data.source}`;
  if (seen.has(key)) return;
  const id = toReasonId(data.title, reasons.length + 1);
  reasons.push({ id, ...data });
  seen.add(key);
}

type UploadedDoc = {
  name: string;
  text: string;
};

const DOCUMENT_KEYWORDS: Record<string, string[]> = {
  transcript: ["transcript", "academic record", "grade report", "marksheet"],
  passport: ["passport", "travel document"],
  id: ["photo id", "identity card", "government id", "national id"],
  income: [
    "income proof",
    "proof of income",
    "pay stub",
    "payslip",
    "bank statement",
    "tax return",
    "w-2",
    "salary slip",
    "form 16",
  ],
  bank_statement: ["bank statement", "account statement"],
  certificate: ["certificate", "certification", "license"],
  resume: ["resume", "cv", "curriculum vitae"],
  recommendation: ["recommendation letter", "reference letter", "letter of recommendation", "lor"],
  address: ["proof of address", "utility bill", "residence proof", "address proof"],
  visa: ["visa", "immigration status"],
  sop: ["statement of purpose", "personal statement", "sop", "motivation letter"],
  admission: ["admission letter", "offer letter", "acceptance letter"],
  employment: ["employment letter", "employment certificate", "offer of employment"],
  medical: ["medical report", "medical certificate", "health certificate"],
  background: ["background check", "police clearance", "criminal record", "character certificate"],
  photo: ["passport photo", "photograph", "photo"],
  notarized_copy: ["notarized", "notary", "notary public"],
  certified_copy: ["certified copy", "true copy", "attested copy"],
  ssn: ["social security", "ssn", "social security number"],
  i94: ["i-94", "i94"],
  drivers_license: ["driver license", "drivers license", "driver's license", "driving licence"],
  national_insurance: ["national insurance", "ni number"],
  brp: ["biometric residence permit", "brp"],
  residence_permit: ["residence permit", "residency permit", "pr card", "permanent resident card"],
  aadhaar: ["aadhaar", "aadhar", "uidai"],
  pan: ["pan card", "permanent account number", "pan"],
  medicare: ["medicare card", "medicare"],
  tfn: ["tax file number", "tfn"],
};

const QUALIFIER_KEYWORDS: Record<string, string[]> = {
  recent_3_months: ["last 3 months", "past 3 months", "previous 3 months"],
  recent_6_months: ["last 6 months", "past 6 months", "previous 6 months"],
  recent_12_months: ["last 12 months", "past 12 months", "previous 12 months", "last year"],
};

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

function docIncludes(doc: UploadedDoc, keyword: string): boolean {
  const lowerName = doc.name.toLowerCase();
  const lowerText = doc.text.toLowerCase();
  return lowerName.includes(keyword) || lowerText.includes(keyword);
}

function hasDocument(docs: UploadedDoc[], keywords: string[]): boolean {
  return docs.some((doc) => keywords.some((keyword) => docIncludes(doc, keyword)));
}

function extractRequiredDocs(rules: string[]): { docs: string[]; qualifiers: string[] } {
  const required = new Set<string>();
  const qualifiers = new Set<string>();
  for (const rule of rules) {
    const lower = rule.toLowerCase();
    if (
      lower.includes("required") ||
      lower.includes("must provide") ||
      lower.includes("must submit") ||
      lower.includes("upload") ||
      lower.includes("provide")
    ) {
      for (const [docKey, keywords] of Object.entries(DOCUMENT_KEYWORDS)) {
        if (keywords.some((keyword) => lower.includes(keyword))) {
          required.add(docKey);
        }
      }
      for (const [qualifierKey, keywords] of Object.entries(QUALIFIER_KEYWORDS)) {
        if (keywords.some((keyword) => lower.includes(keyword))) {
          qualifiers.add(qualifierKey);
        }
      }
    }
  }
  return { docs: Array.from(required), qualifiers: Array.from(qualifiers) };
}

function parseDate(input: string): Date | undefined {
  const trimmed = input.trim();
  const iso = trimmed.match(/^\d{4}[-.]\d{1,2}[-.]\d{1,2}$/);
  if (iso) {
    const date = parseISO(trimmed.replace(/\./g, "-"));
    return isValid(date) ? date : undefined;
  }

  const formats = ["MM/dd/yyyy", "dd/MM/yyyy", "M/d/yyyy", "d/M/yyyy", "yyyy-MM-dd"];
  for (const format of formats) {
    const parsed = parse(trimmed, format, new Date());
    if (isValid(parsed)) return parsed;
  }

  const monthName = trimmed.match(
    /^(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+(\d{1,2}),?\s+(\d{4})$/i
  );
  if (monthName) {
    const monthIndex = MONTHS[monthName[1].toLowerCase()];
    const day = Number(monthName[2]);
    const year = Number(monthName[3]);
    const isoCandidate = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`;
    const parsed = parseISO(isoCandidate);
    return isValid(parsed) ? parsed : undefined;
  }

  return undefined;
}

function extractDates(text: string): Date[] {
  const candidates: Date[] = [];
  const patterns = [
    /\b\d{4}[-.]\d{1,2}[-.]\d{1,2}\b/g,
    /\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}\b/g,
    /\b(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+\d{1,2},?\s+\d{4}\b/gi,
  ];

  for (const pattern of patterns) {
    const matches = text.match(pattern) ?? [];
    for (const match of matches) {
      const date = parseDate(match);
      if (date) candidates.push(date);
    }
  }
  return candidates;
}

function computeAge(dob: Date, now: Date): number {
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }
  return age;
}

function analyzeUploadedDocs(
  uploadedDocs: UploadedDoc[],
  userInfo: UserInfo,
  reasons: Reason[],
  seen: Set<string>,
  recommendationSet: Set<string>
) {
  const now = new Date();
  const age = typeof userInfo.age === "number" ? userInfo.age : undefined;

  for (const doc of uploadedDocs) {
    const text = doc.text || "";
    const lower = text.toLowerCase();

    if (!text.trim() || text.trim().length < 120) {
      addReason(reasons, seen, {
        title: "Unreadable or very short document",
        severity: "high",
        explanation: `${doc.name} appears too short or unreadable to verify requirements.`,
        recommendation: `Re-upload ${doc.name} with clearer or more complete text.`,
        source: "document",
      });
      recommendationSet.add(`Re-upload ${doc.name} with clearer or more complete text.`);
    }

    if (
      lower.includes("expired") ||
      lower.includes("void") ||
      lower.includes("invalid") ||
      lower.includes("cancelled") ||
      lower.includes("canceled")
    ) {
      addReason(reasons, seen, {
        title: "Document marked expired or invalid",
        severity: "high",
        explanation: `${doc.name} contains keywords indicating it is expired, invalid, or void.`,
        recommendation: `Upload a valid, unexpired version of ${doc.name}.`,
        source: "document",
      });
      recommendationSet.add(`Upload a valid, unexpired version of ${doc.name}.`);
    }

    if (lower.includes("expiry") || lower.includes("expiration") || lower.includes("valid until")) {
      const dates = extractDates(text);
      const latest = dates.sort((a, b) => b.getTime() - a.getTime())[0];
      if (latest && latest.getTime() < now.getTime()) {
        addReason(reasons, seen, {
          title: "Document appears expired",
          severity: "high",
          explanation: `${doc.name} includes an expiration date that has already passed.`,
          recommendation: `Provide a version of ${doc.name} that is currently valid.`,
          source: "document",
        });
        recommendationSet.add(`Provide a version of ${doc.name} that is currently valid.`);
      }
    }

    if (age !== undefined && (lower.includes("date of birth") || lower.includes("dob"))) {
      const dates = extractDates(text);
      const dob = dates.sort((a, b) => a.getTime() - b.getTime())[0];
      if (dob) {
        const computedAge = computeAge(dob, now);
        if (Math.abs(computedAge - age) >= 2) {
          addReason(reasons, seen, {
            title: "Age mismatch with document DOB",
            severity: "medium",
            explanation: `${doc.name} contains a date of birth that does not align with the provided age.`,
            recommendation:
              "Ensure the age matches the date of birth on submitted documents.",
            source: "document",
          });
          recommendationSet.add(
            "Ensure the age matches the date of birth on submitted documents."
          );
        }
      }
    }
  }
}

const NAME_KEYWORDS = ["full name", "applicant name", "name of applicant", "name"];
const ADDRESS_KEYWORDS = ["address", "street", "road", "city", "state", "zip", "postal"];
const NAME_STOPWORDS = ["mr", "mrs", "ms", "dr", "miss", "mr.", "mrs.", "ms.", "dr."];

function normalizeTokens(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token && token.length > 1 && !NAME_STOPWORDS.includes(token));
}

function similarityScore(a: string, b: string): number {
  const aTokens = new Set(normalizeTokens(a));
  const bTokens = new Set(normalizeTokens(b));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  const intersection = Array.from(aTokens).filter((token) => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size;
  return intersection / union;
}

function extractNameCandidates(text: string): string[] {
  const candidates: string[] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (NAME_KEYWORDS.some((keyword) => lower.includes(keyword))) {
      const match = line.match(/(?:full name|applicant name|name of applicant|name)\s*[:\-]\s*(.+)$/i);
      if (match?.[1]) {
        candidates.push(match[1].trim());
      }
    }
    if (/^[A-Z][A-Z\s'.-]{4,}$/.test(line.trim())) {
      const wordCount = line.trim().split(/\s+/).length;
      if (wordCount >= 2 && wordCount <= 4) {
        candidates.push(line.trim());
      }
    }
  }
  return candidates.filter((name) => name.length >= 4);
}

function extractAddressCandidates(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const matches = lines.filter((line) =>
    ADDRESS_KEYWORDS.some((keyword) => line.toLowerCase().includes(keyword))
  );
  return matches.map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function analyzeNameMismatch(
  uploadedDocs: UploadedDoc[],
  reasons: Reason[],
  seen: Set<string>,
  recommendationSet: Set<string>
) {
  const nameEntries = uploadedDocs
    .map((doc) => ({ name: doc.name, candidates: extractNameCandidates(doc.text) }))
    .filter((entry) => entry.candidates.length > 0);

  if (nameEntries.length < 2) return;
  const primary = nameEntries[0].candidates[0];

  for (const entry of nameEntries.slice(1)) {
    const candidate = entry.candidates[0];
    if (similarityScore(primary, candidate) < 0.5) {
      addReason(reasons, seen, {
        title: "Name mismatch across documents",
        severity: "high",
        explanation: `Names appear inconsistent between ${nameEntries[0].name} and ${entry.name}.`,
        recommendation: "Ensure all documents use the exact same legal name.",
        source: "document",
      });
      recommendationSet.add("Ensure all documents use the exact same legal name.");
      break;
    }
  }
}

function analyzeAddressMismatch(
  uploadedDocs: UploadedDoc[],
  reasons: Reason[],
  seen: Set<string>,
  recommendationSet: Set<string>
) {
  const addressEntries = uploadedDocs
    .map((doc) => ({ name: doc.name, addresses: extractAddressCandidates(doc.text) }))
    .filter((entry) => entry.addresses.length > 0);

  if (addressEntries.length < 2) return;
  const primary = addressEntries[0].addresses[0];

  for (const entry of addressEntries.slice(1)) {
    const candidate = entry.addresses[0];
    if (similarityScore(primary, candidate) < 0.4) {
      addReason(reasons, seen, {
        title: "Address mismatch across documents",
        severity: "medium",
        explanation: `Addresses appear inconsistent between ${addressEntries[0].name} and ${entry.name}.`,
        recommendation: "Ensure your documents list the same current address.",
        source: "document",
      });
      recommendationSet.add("Ensure your documents list the same current address.");
      break;
    }
  }
}

function documentHasKeyword(doc: UploadedDoc, keywords: string[]): boolean {
  return keywords.some((keyword) => docIncludes(doc, keyword));
}

function documentAppearsExpired(doc: UploadedDoc): boolean {
  const lower = doc.text.toLowerCase();
  if (
    lower.includes("expired") ||
    lower.includes("invalid") ||
    lower.includes("void") ||
    lower.includes("cancelled") ||
    lower.includes("canceled")
  ) {
    return true;
  }
  if (lower.includes("expiry") || lower.includes("expiration") || lower.includes("valid until")) {
    const dates = extractDates(doc.text);
    const latest = dates.sort((a, b) => b.getTime() - a.getTime())[0];
    if (latest && latest.getTime() < Date.now()) return true;
  }
  return false;
}

export function analyzeRules(
  rules: string[],
  userInfo: UserInfo,
  uploadedDocs: UploadedDoc[] = [],
  extraRequiredDocs: string[] = []
): RuleCheckResult {
  const reasons: Reason[] = [];
  const seen = new Set<string>();
  const recommendations = new Set<string>();
  const age = typeof userInfo.age === "number" ? userInfo.age : undefined;
  const income = typeof userInfo.income === "number" ? userInfo.income : undefined;
  const studentStatus = (userInfo.studentStatus ?? "").toLowerCase();
  const country = normalizeCountry(userInfo.country);

  for (const rule of rules) {
    const lower = rule.toLowerCase();

    if (lower.includes("age") || lower.includes("years old")) {
      const range = parseAgeRule(rule);
      if (age === undefined) {
        addReason(reasons, seen, {
          title: "Missing age information",
          severity: "low",
          explanation: "Eligibility rules mention age, but no age was provided.",
          recommendation: "Provide your age to verify age eligibility.",
          source: "rule",
        });
        recommendations.add("Provide your age to verify age eligibility.");
      } else if (range.min !== undefined && age < range.min) {
        addReason(reasons, seen, {
          title: "Age below minimum requirement",
          severity: "high",
          explanation: `Rule: ${rule}`,
          recommendation: "Ensure your age meets the minimum requirement.",
          source: "rule",
        });
        recommendations.add("Ensure your age meets the minimum requirement.");
      } else if (range.max !== undefined) {
        const isAboveMax = range.maxExclusive ? age >= range.max : age > range.max;
        if (isAboveMax) {
          addReason(reasons, seen, {
            title: "Age above maximum requirement",
            severity: "high",
            explanation: `Rule: ${rule}`,
            recommendation: "Check the maximum age limit for this program.",
            source: "rule",
          });
          recommendations.add("Check the maximum age limit for this program.");
        }
      }
    }

    if (lower.includes("income") || lower.includes("annual") || lower.includes("earn")) {
      const range = parseIncomeRule(rule);
      if (income === undefined) {
        addReason(reasons, seen, {
          title: "Missing income information",
          severity: "low",
          explanation: "Eligibility rules mention income, but no income was provided.",
          recommendation: "Provide your income to verify income eligibility.",
          source: "rule",
        });
        recommendations.add("Provide your income to verify income eligibility.");
      } else if (range.min !== undefined && income < range.min) {
        addReason(reasons, seen, {
          title: "Income below minimum requirement",
          severity: "high",
          explanation: `Rule: ${rule}`,
          recommendation: "Verify that your income meets the minimum requirement.",
          source: "rule",
        });
        recommendations.add("Verify that your income meets the minimum requirement.");
      } else if (range.max !== undefined && income > range.max) {
        addReason(reasons, seen, {
          title: "Income above maximum requirement",
          severity: "high",
          explanation: `Rule: ${rule}`,
          recommendation: "Verify that your income is within the allowed maximum.",
          source: "rule",
        });
        recommendations.add("Verify that your income is within the allowed maximum.");
      }
    }

    const studentRequirement = includesStudentRequirement(rule);
    if (studentRequirement === "student") {
      if (studentStatus && studentStatus !== "student") {
        addReason(reasons, seen, {
          title: "Student status requirement not met",
          severity: "high",
          explanation: `Rule: ${rule}`,
          recommendation: "Confirm that student status is required.",
          source: "rule",
        });
        recommendations.add("Confirm that student status is required.");
      } else if (!studentStatus) {
        addReason(reasons, seen, {
          title: "Missing student status information",
          severity: "low",
          explanation: "Eligibility rules mention student status, but no status was provided.",
          recommendation: "Provide your student status to verify eligibility.",
          source: "rule",
        });
        recommendations.add("Provide your student status to verify eligibility.");
      }
    }
    if (studentRequirement === "non-student") {
      if (studentStatus === "student") {
        addReason(reasons, seen, {
          title: "Student status conflict",
          severity: "high",
          explanation: `Rule: ${rule}`,
          recommendation: "Confirm whether students are excluded.",
          source: "rule",
        });
        recommendations.add("Confirm whether students are excluded.");
      } else if (!studentStatus) {
        addReason(reasons, seen, {
          title: "Missing student status information",
          severity: "low",
          explanation: "Eligibility rules mention student status, but no status was provided.",
          recommendation: "Provide your student status to verify eligibility.",
          source: "rule",
        });
        recommendations.add("Provide your student status to verify eligibility.");
      }
    }

    if (lower.includes("resident") || lower.includes("citizen") || lower.includes("available in") || lower.includes("only in")) {
      const requiredCountry = detectCountryRequirement(rule);
      if (requiredCountry) {
        if (country && !country.includes(requiredCountry) && !requiredCountry.includes(country)) {
          addReason(reasons, seen, {
            title: "Residency requirement not met",
            severity: "high",
            explanation: `Rule: ${rule}`,
            recommendation: "Check residency or citizenship requirements.",
            source: "rule",
          });
          recommendations.add("Check residency or citizenship requirements.");
        } else if (!country) {
          addReason(reasons, seen, {
            title: "Missing country information",
            severity: "low",
            explanation: "Eligibility rules mention residency, but no country was provided.",
            recommendation: "Provide your country to verify residency requirements.",
            source: "rule",
          });
          recommendations.add("Provide your country to verify residency requirements.");
        }
      }
    }
  }

  const { docs: requiredDocs, qualifiers } = extractRequiredDocs(rules);
  const combinedRequiredDocs = new Set<string>([...requiredDocs, ...extraRequiredDocs]);

  for (const docKey of combinedRequiredDocs) {
    const keywords = DOCUMENT_KEYWORDS[docKey];
    if (!keywords) continue;
    if (!hasDocument(uploadedDocs, keywords)) {
      const label = keywords[0];
      addReason(reasons, seen, {
        title: "Missing required document",
        severity: "high",
        explanation: `Eligibility rules or selected requirements mention ${label}, but no matching document was found.`,
        recommendation: `Upload a valid ${label} to satisfy document requirements.`,
        source: "cross",
      });
      recommendations.add(`Upload a valid ${label} to satisfy document requirements.`);
    }
  }

  if (requiredDocs.includes("bank_statement") && qualifiers.length > 0) {
    const qualifierLabel =
      qualifiers.includes("recent_3_months")
        ? "from the last 3 months"
        : qualifiers.includes("recent_6_months")
        ? "from the last 6 months"
        : qualifiers.includes("recent_12_months")
        ? "from the last 12 months"
        : "";
    if (qualifierLabel) {
      recommendations.add(`Ensure bank statements are ${qualifierLabel}.`);
    }
  }

  analyzeUploadedDocs(uploadedDocs, userInfo, reasons, seen, recommendations);
  analyzeNameMismatch(uploadedDocs, reasons, seen, recommendations);
  analyzeAddressMismatch(uploadedDocs, reasons, seen, recommendations);

  const mandatoryDocTypes = [
    "passport",
    "transcript",
    "bank_statement",
    "income",
    "id",
    "visa",
    "address",
  ];
  for (const docType of mandatoryDocTypes) {
    const keywords = DOCUMENT_KEYWORDS[docType];
    if (!keywords) continue;
    const ruleMentionsDoc = rules.some((rule) =>
      keywords.some((keyword) => rule.toLowerCase().includes(keyword))
    );
    if (ruleMentionsDoc && !hasDocument(uploadedDocs, keywords)) {
      addReason(reasons, seen, {
        title: "Missing document required by eligibility rules",
        severity: "high",
        explanation: `Eligibility rules mention ${keywords[0]}, but no matching document was uploaded.`,
        recommendation: `Provide a ${keywords[0]} that matches the requirement.`,
        source: "cross",
      });
      recommendations.add(`Provide a ${keywords[0]} that matches the requirement.`);
    }
  }

  for (const rule of rules) {
    const lower = rule.toLowerCase();
    if (lower.includes("passport") && lower.includes("valid")) {
      const passportKeywords = DOCUMENT_KEYWORDS.passport ?? [];
      const matchingDocs = uploadedDocs.filter((doc) =>
        documentHasKeyword(doc, passportKeywords)
      );
      if (matchingDocs.length === 0) {
        addReason(reasons, seen, {
          title: "Valid passport required",
          severity: "high",
          explanation: `Rule: ${rule}`,
          recommendation: "Upload a valid passport that meets the rule.",
          source: "cross",
        });
        recommendations.add("Upload a valid passport that meets the rule.");
      } else if (matchingDocs.some((doc) => documentAppearsExpired(doc))) {
        addReason(reasons, seen, {
          title: "Passport appears expired",
          severity: "high",
          explanation: "A passport document appears to be expired while the rule requires it to be valid.",
          recommendation: "Provide a valid, unexpired passport.",
          source: "cross",
        });
        recommendations.add("Provide a valid, unexpired passport.");
      }
    }

    if (lower.includes("bank statement")) {
      const bankKeywords = DOCUMENT_KEYWORDS.bank_statement ?? [];
      if (!hasDocument(uploadedDocs, bankKeywords)) {
        addReason(reasons, seen, {
          title: "Bank statement required",
          severity: "high",
          explanation: `Rule: ${rule}`,
          recommendation: "Upload a bank statement that meets the requirement.",
          source: "cross",
        });
        recommendations.add("Upload a bank statement that meets the requirement.");
      }
    }
  }

  return {
    reasons,
    likelyReasons: reasons.map((reason) => reason.title),
    recommendations: Array.from(recommendations),
  };
}
