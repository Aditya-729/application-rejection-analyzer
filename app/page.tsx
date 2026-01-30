"use client";

import { useState } from "react";
import { extractDocuments } from "@/lib/client/extractDocuments";

type AnalysisResponse = {
  reasons: {
    id: string;
    title: string;
    severity: "high" | "medium" | "low";
    explanation: string;
    recommendation: string;
    source: "rule" | "document" | "cross";
  }[];
  likelyReasons?: string[];
  recommendations?: string[];
  error?: string;
};

const MAX_TEXT_LENGTH = 20000;
const MAX_FILES = 5;
const MAX_FILE_SIZE_MB = 5;
const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const COUNTRY_OPTIONS = [
  "Afghanistan",
  "Albania",
  "Algeria",
  "Andorra",
  "Angola",
  "Antigua and Barbuda",
  "Argentina",
  "Armenia",
  "Australia",
  "Austria",
  "Azerbaijan",
  "Bahamas",
  "Bahrain",
  "Bangladesh",
  "Barbados",
  "Belarus",
  "Belgium",
  "Belize",
  "Benin",
  "Bhutan",
  "Bolivia",
  "Bosnia and Herzegovina",
  "Botswana",
  "Brazil",
  "Brunei",
  "Bulgaria",
  "Burkina Faso",
  "Burundi",
  "Cabo Verde",
  "Cambodia",
  "Cameroon",
  "Canada",
  "Central African Republic",
  "Chad",
  "Chile",
  "China",
  "Colombia",
  "Comoros",
  "Congo (Congo-Brazzaville)",
  "Costa Rica",
  "Cote d'Ivoire",
  "Croatia",
  "Cuba",
  "Cyprus",
  "Czechia",
  "Democratic Republic of the Congo",
  "Denmark",
  "Djibouti",
  "Dominica",
  "Dominican Republic",
  "Ecuador",
  "Egypt",
  "El Salvador",
  "Equatorial Guinea",
  "Eritrea",
  "Estonia",
  "Eswatini",
  "Ethiopia",
  "Fiji",
  "Finland",
  "France",
  "Gabon",
  "Gambia",
  "Georgia",
  "Germany",
  "Ghana",
  "Greece",
  "Grenada",
  "Guatemala",
  "Guinea",
  "Guinea-Bissau",
  "Guyana",
  "Haiti",
  "Honduras",
  "Hungary",
  "Iceland",
  "India",
  "Indonesia",
  "Iran",
  "Iraq",
  "Ireland",
  "Israel",
  "Italy",
  "Jamaica",
  "Japan",
  "Jordan",
  "Kazakhstan",
  "Kenya",
  "Kiribati",
  "Kuwait",
  "Kyrgyzstan",
  "Laos",
  "Latvia",
  "Lebanon",
  "Lesotho",
  "Liberia",
  "Libya",
  "Liechtenstein",
  "Lithuania",
  "Luxembourg",
  "Madagascar",
  "Malawi",
  "Malaysia",
  "Maldives",
  "Mali",
  "Malta",
  "Marshall Islands",
  "Mauritania",
  "Mauritius",
  "Mexico",
  "Micronesia",
  "Moldova",
  "Monaco",
  "Mongolia",
  "Montenegro",
  "Morocco",
  "Mozambique",
  "Myanmar",
  "Namibia",
  "Nauru",
  "Nepal",
  "Netherlands",
  "New Zealand",
  "Nicaragua",
  "Niger",
  "Nigeria",
  "North Korea",
  "North Macedonia",
  "Norway",
  "Oman",
  "Pakistan",
  "Palau",
  "Palestine",
  "Panama",
  "Papua New Guinea",
  "Paraguay",
  "Peru",
  "Philippines",
  "Poland",
  "Portugal",
  "Qatar",
  "Romania",
  "Russia",
  "Rwanda",
  "Saint Kitts and Nevis",
  "Saint Lucia",
  "Saint Vincent and the Grenadines",
  "Samoa",
  "San Marino",
  "Sao Tome and Principe",
  "Saudi Arabia",
  "Senegal",
  "Serbia",
  "Seychelles",
  "Sierra Leone",
  "Singapore",
  "Slovakia",
  "Slovenia",
  "Solomon Islands",
  "Somalia",
  "South Africa",
  "South Korea",
  "South Sudan",
  "Spain",
  "Sri Lanka",
  "Sudan",
  "Suriname",
  "Sweden",
  "Switzerland",
  "Syria",
  "Taiwan",
  "Tajikistan",
  "Tanzania",
  "Thailand",
  "Timor-Leste",
  "Togo",
  "Tonga",
  "Trinidad and Tobago",
  "Tunisia",
  "Turkey",
  "Turkmenistan",
  "Tuvalu",
  "Uganda",
  "Ukraine",
  "United Arab Emirates",
  "United Kingdom",
  "United States",
  "Uruguay",
  "Uzbekistan",
  "Vanuatu",
  "Vatican City",
  "Venezuela",
  "Vietnam",
  "Yemen",
  "Zambia",
  "Zimbabwe",
  "Schengen Area",
  "Other",
];

const REGION_DOC_OPTIONS: Record<
  string,
  { key: string; label: string }[]
> = {
  "United States": [
    { key: "ssn", label: "Social Security Number (SSN) card" },
    { key: "i94", label: "I-94 Arrival/Departure Record" },
    { key: "drivers_license", label: "Driver's license / state ID" },
  ],
  Canada: [
    { key: "residence_permit", label: "Permanent resident (PR) card" },
    { key: "id", label: "Government-issued photo ID" },
  ],
  "United Kingdom": [
    { key: "brp", label: "Biometric Residence Permit (BRP)" },
    { key: "national_insurance", label: "National Insurance number" },
  ],
  India: [
    { key: "aadhaar", label: "Aadhaar card" },
    { key: "pan", label: "PAN card" },
  ],
  Australia: [
    { key: "medicare", label: "Medicare card" },
    { key: "tfn", label: "Tax File Number (TFN)" },
  ],
  "Schengen Area": [
    { key: "residence_permit", label: "Residence permit" },
    { key: "passport", label: "Passport copy" },
  ],
  Other: [
    { key: "passport", label: "Passport copy" },
    { key: "id", label: "Government-issued photo ID" },
  ],
};

export default function HomePage() {
  const [applicationUrl, setApplicationUrl] = useState("");
  const [age, setAge] = useState("");
  const [studentStatus, setStudentStatus] = useState("");
  const [income, setIncome] = useState("");
  const [countrySelection, setCountrySelection] = useState("");
  const [customCountry, setCustomCountry] = useState("");
  const [regionDocs, setRegionDocs] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [ocrStatus, setOcrStatus] = useState("");
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResponse | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);
    setOcrStatus("");

    try {
      if (uploadErrors.length > 0) {
        throw new Error("Please fix the document upload errors first.");
      }

      const extractedDocs = await extractDocuments(files, {
        maxTextLength: MAX_TEXT_LENGTH,
        onStatus: setOcrStatus,
      });

      const payload = {
        applicationUrl,
        userInfo: {
          age: age !== "" ? Number(age) : undefined,
          studentStatus: studentStatus || undefined,
          income: income !== "" ? Number(income) : undefined,
          country: countrySelection === "Other" ? customCountry : countrySelection,
        },
        documents: extractedDocs.filter((doc) => doc.text.trim().length > 0),
        extraRequiredDocs: regionDocs,
      };

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as AnalysisResponse;

      if (!response.ok) {
        throw new Error(data.error || "Analysis failed.");
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-12">
      <header className="flex flex-col gap-3 text-center">
        <h1 className="text-3xl font-semibold text-slate-900">
          Application Rejection Analyzer
        </h1>
        <p className="text-base text-slate-600">
          Paste an application URL and basic details to identify the most likely
          rejection reasons from eligibility rules.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 md:col-span-2">
            Application URL
            <input
              type="url"
              required
              value={applicationUrl}
              onChange={(event) => setApplicationUrl(event.target.value)}
              placeholder="https://example.com/application"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Age
            <input
              type="number"
              min="0"
              value={age}
              onChange={(event) => setAge(event.target.value)}
              placeholder="e.g. 24"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Student Status
            <select
              value={studentStatus}
              onChange={(event) => setStudentStatus(event.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
            >
              <option value="">Select</option>
              <option value="student">Student</option>
              <option value="not-student">Not a student</option>
            </select>
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Annual Income
            <input
              type="number"
              min="0"
              value={income}
              onChange={(event) => setIncome(event.target.value)}
              placeholder="e.g. 35000"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Country
            <select
              value={countrySelection}
              onChange={(event) => {
                setCountrySelection(event.target.value);
                setRegionDocs([]);
              }}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
            >
              <option value="">Select</option>
              {COUNTRY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          {countrySelection === "Other" && (
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
              Country Name
              <input
                type="text"
                value={customCountry}
                onChange={(event) => setCustomCountry(event.target.value)}
                placeholder="Enter country"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
              />
            </label>
          )}

          {countrySelection && (
            <div className="flex flex-col gap-2 text-sm text-slate-700 md:col-span-2">
              <span className="font-medium">Region-specific documents</span>
              <div className="grid gap-2 md:grid-cols-2">
                {(REGION_DOC_OPTIONS[countrySelection] ?? []).map((doc) => (
                  <label key={doc.key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={regionDocs.includes(doc.key)}
                      onChange={(event) => {
                        setRegionDocs((prev) =>
                          event.target.checked
                            ? [...prev, doc.key]
                            : prev.filter((item) => item !== doc.key)
                        );
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-slate-900"
                    />
                    {doc.label}
                  </label>
                ))}
              </div>
              <span className="text-xs text-slate-500">
                Select any regional documents you plan to submit to improve analysis.
              </span>
            </div>
          )}

          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 md:col-span-2">
            Supporting Documents (PDF, DOCX)
            <input
              type="file"
              multiple
              accept=".pdf,.docx"
              onChange={(event) => {
                const nextFiles = Array.from(event.target.files ?? []);
                const { validFiles, errors } = validateFiles(nextFiles);
                setFiles(validFiles);
                setUploadErrors(errors);
              }}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            />
            <span className="text-xs text-slate-500">
              Max 5 files, 5 MB each. Upload transcripts, income proof, IDs, etc.
            </span>
            {uploadErrors.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {uploadErrors.map((issue) => (
                  <div key={issue}>{issue}</div>
                ))}
              </div>
            )}
          </label>

        </div>

        <button
          type="submit"
          disabled={loading || uploadErrors.length > 0}
          className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {loading ? "Analyzing..." : "Analyze Rejection Reasons"}
        </button>
      </form>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Results</h2>
        <p className="mt-1 text-sm text-slate-600">
          Likely rejection reasons and recommended next steps.
        </p>

        {loading && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {ocrStatus ? `Analyzing... ${ocrStatus}` : "Analyzing..."}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && !result && (
          <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            Submit an application URL to see results.
          </div>
        )}

        {result && (!result.reasons || result.reasons.length === 0) && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
            No issues detected from the uploaded documents and eligibility rules.
          </div>
        )}

        {result && result.reasons && result.reasons.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600">
                  <th className="px-3 py-2 font-medium">Issue</th>
                  <th className="px-3 py-2 font-medium">Severity</th>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">Explanation</th>
                  <th className="px-3 py-2 font-medium">Recommendation</th>
                </tr>
              </thead>
              <tbody>
                {result.reasons?.map((reason) => (
                  <tr
                    key={reason.id}
                    className="border-b border-slate-100 last:border-none"
                  >
                    <td className="px-3 py-3 text-slate-800">{reason.title}</td>
                    <td className="px-3 py-3 text-slate-700">{reason.severity}</td>
                    <td className="px-3 py-3 text-slate-700">{reason.source}</td>
                    <td className="px-3 py-3 text-slate-700">{reason.explanation}</td>
                    <td className="px-3 py-3 text-slate-700">{reason.recommendation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function validateFiles(files: File[]) {
  const errors: string[] = [];
  const validFiles: File[] = [];

  if (files.length > MAX_FILES) {
    errors.push(`You can upload up to ${MAX_FILES} files.`);
  }

  for (const file of files.slice(0, MAX_FILES)) {
    const sizeMb = file.size / (1024 * 1024);
    if (sizeMb > MAX_FILE_SIZE_MB) {
      errors.push(`${file.name} exceeds ${MAX_FILE_SIZE_MB} MB.`);
      continue;
    }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      errors.push(`${file.name} is not a supported file type.`);
      continue;
    }
    validFiles.push(file);
  }

  return { validFiles, errors };
}
