import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { createWorker } from "tesseract.js";
import mammoth from "mammoth";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://unpkg.com/pdfjs-dist@4.7.76/build/pdf.worker.min.mjs";

export type ExtractedDocument = {
  filename: string;
  text: string;
};

export type ExtractOptions = {
  ocrLanguage: string;
  enableOcr: boolean;
  maxTextLength: number;
  maxOcrPages: number;
  ocrTimeoutMs: number;
  onStatus?: (message: string) => void;
};

const MIN_TEXT_THRESHOLD = 80;

function normalizeText(input: string, maxLength: number): string {
  return input.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("OCR timeout")), timeoutMs);
    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function extractPdfText(file: File): Promise<string> {
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

async function extractPdfOcr(
  file: File,
  worker: Awaited<ReturnType<typeof createWorker>>,
  options: ExtractOptions
): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageCount = Math.min(pdf.numPages, options.maxOcrPages);
  let combinedText = "";

  for (let pageIndex = 1; pageIndex <= pageCount; pageIndex += 1) {
    options.onStatus?.(`OCR scanning ${file.name} (page ${pageIndex}/${pageCount})`);
    const page = await pdf.getPage(pageIndex);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) continue;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: context, viewport }).promise;
    const { data } = await withTimeout(worker.recognize(canvas), options.ocrTimeoutMs);
    combinedText += `\n${data.text ?? ""}`;
  }

  return combinedText;
}

async function extractImageOcr(
  file: File,
  worker: Awaited<ReturnType<typeof createWorker>>,
  options: ExtractOptions
): Promise<string> {
  options.onStatus?.(`OCR scanning ${file.name}`);
  const { data } = await withTimeout(worker.recognize(file), options.ocrTimeoutMs);
  return data.text ?? "";
}

async function extractDocxText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value ?? "";
}

async function getOcrWorker(options: ExtractOptions) {
  const worker = (await createWorker({
    logger: (message: { status?: string; progress?: number }) => {
      if (message.status) {
        const pct = message.progress ? Math.round(message.progress * 100) : 0;
        options.onStatus?.(`${message.status} ${pct}%`);
      }
    },
  } as unknown as Parameters<typeof createWorker>[0])) as any;
  const language = options.ocrLanguage?.trim() || "eng";
  await worker.loadLanguage(language);
  await worker.initialize(language);
  return worker;
}

export async function extractDocuments(
  files: File[],
  options: ExtractOptions
): Promise<ExtractedDocument[]> {
  const results: ExtractedDocument[] = [];
  const useOcr = options.enableOcr;
  const worker = useOcr ? await getOcrWorker(options) : null;

  try {
    for (const file of files) {
      const name = file.name || "document";
      const lower = name.toLowerCase();
      options.onStatus?.(`Reading ${name}`);

      try {
        let text = "";
        if (lower.endsWith(".pdf")) {
          text = await extractPdfText(file);
          if (useOcr && text.trim().length < MIN_TEXT_THRESHOLD) {
            text = await extractPdfOcr(file, worker!, options);
          }
        } else if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
          if (useOcr) {
            text = await extractImageOcr(file, worker!, options);
          }
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
  } finally {
    if (worker) {
      await worker.terminate();
    }
    options.onStatus?.("");
  }

  return results;
}
