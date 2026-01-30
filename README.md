# Application Rejection Analyzer

Application Rejection Analyzer is a deterministic, rule-based web app that analyzes an application page and highlights likely eligibility mismatches. It uses the Mino API to read eligibility rules, exclusions, FAQs, and linked PDFs, then compares those rules against basic user information.

## Features
- Fetches application page content with Mino API (including linked rules/FAQs/PDFs)
- Extracts eligibility and exclusion lines from the content
- Client-side document extraction for PDF, DOCX, and images (PNG/JPG)
- OCR runs locally in the browser for scanned documents (tesseract.js)
- Compares extracted rules with user info and document evidence
- Returns structured reasons with severity and recommendations

## Tech Stack
- Next.js App Router + TypeScript
- Tailwind CSS
- Mino API (required; no other APIs or LLMs)

## Environment Variables
Create a `.env.local` file and set:
```
MINO_API_URL=your_mino_api_endpoint
MINO_API_KEY=your_mino_api_key
```

## Development
Install dependencies and run the dev server:
```
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

## Production
```
npm run build
npm run start
```

## How Mino Is Used
`lib/mino.ts` sends the application URL to the Mino API, asks it to follow links containing:
`eligibility`, `requirements`, `exclusions`, `faq`, `rules`, `pdf`,
and collects any visible text content returned by the API (including PDFs when text is available).

## Document Privacy
- Documents are **processed locally in the browser**.
- Only extracted text is sent to the API for deterministic analysis.
- No documents are uploaded or stored on the server.

## Rule Logic Overview
1. `lib/extract.ts` keeps lines containing eligibility keywords (eligible, requirements, exclusions, age, income, etc.).
2. `lib/rules.ts` compares those lines with user info and uploaded docs:
   - Age requirements (minimum/maximum/under/over)
   - Income thresholds (minimum/maximum)
   - Student-only or non-student exclusions
   - Residency/citizenship constraints by country
   - Required documents (transcript, passport, income proof, etc.)
3. The API responds with structured reasons, severity, and recommendations.

## Project Structure
- `lib/mino.ts` — Calls Mino API and collects page text
- `lib/extract.ts` — Extracts rule-like lines
- `lib/client/extractDocuments.ts` — Client-side document extraction
- `lib/rules.ts` — Deterministic rule + document comparison
- `app/api/analyze/route.ts` — API endpoint for analysis (text-only)
- `app/page.tsx` — Minimal UI + file uploads + OCR

## Notes
- The system is fully deterministic and does not use any AI model.
- The app requires only the Mino API to fetch and read content.
- OCR runs locally in the browser and is optional for scanned documents.
