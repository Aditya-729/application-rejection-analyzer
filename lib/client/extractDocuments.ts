import mammoth from "mammoth";

let pdfjsPromise: Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> | null = null;

async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjsLib) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://unpkg.com/pdfjs-dist@4.7.76/build/pdf.worker.min.mjs";
      return pdfjsLib;
    });
  }
  return pdfjsPromise;
}

export type ExtractedDocument = {
  filename: string;
  text: string;
};

export type ExtractOptions = {
  maxTextLength: number;
  onStatus?: (message: string) => void;
};

function normalizeText(input: string, maxLength: number): string {
  return input.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjsLib = await loadPdfjs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = "";
  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    text += ` ${pageText}`;
  }
  return text;
}

async function extractDocxText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value ?? "";
}

export async function extractDocuments(
  files: File[],
  options: ExtractOptions
): Promise<ExtractedDocument[]> {
  const results: ExtractedDocument[] = [];

  for (const file of files) {
    const name = file.name || "document";
    const lower = name.toLowerCase();
    options.onStatus?.(`Reading ${name}`);

    try {
      let text = "";
      if (lower.endsWith(".pdf")) {
        text = await extractPdfText(file);
      } else if (lower.endsWith(".docx")) {
        text = await extractDocxText(file);
      }

      results.push({
        filename: name,
        text: normalizeText(text, options.maxTextLength),
      });
    } catch {
      results.push({ filename: name, text: "" });
    }
  }

  options.onStatus?.("");

  return results;
}
