export type MinoPage = {
  url: string;
  text: string;
};

export type MinoResult = {
  pages: MinoPage[];
  raw: unknown;
};

const LINK_KEYWORDS = [
  "eligibility",
  "requirements",
  "exclusions",
  "faq",
  "rules",
  "pdf",
];

function extractTextBlocks(payload: unknown): MinoPage[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const data = payload as Record<string, unknown>;
  const pages: MinoPage[] = [];

  const pushPage = (url: string | undefined, text: string | undefined) => {
    if (!text || !text.trim()) return;
    pages.push({
      url: url ?? "unknown",
      text,
    });
  };

  if (Array.isArray(data.pages)) {
    for (const entry of data.pages) {
      if (entry && typeof entry === "object") {
        const item = entry as Record<string, unknown>;
        pushPage(
          typeof item.url === "string" ? item.url : undefined,
          typeof item.text === "string" ? item.text : undefined
        );
      }
    }
  }

  if (Array.isArray(data.documents)) {
    for (const entry of data.documents) {
      if (entry && typeof entry === "object") {
        const item = entry as Record<string, unknown>;
        pushPage(
          typeof item.url === "string" ? item.url : undefined,
          typeof item.text === "string" ? item.text : undefined
        );
      }
    }
  }

  if (Array.isArray(data.results)) {
    for (const entry of data.results) {
      if (entry && typeof entry === "object") {
        const item = entry as Record<string, unknown>;
        pushPage(
          typeof item.url === "string" ? item.url : undefined,
          typeof item.text === "string" ? item.text : undefined
        );
      }
    }
  }

  if (typeof data.text === "string") {
    pushPage(typeof data.url === "string" ? data.url : undefined, data.text);
  }

  return pages;
}

export async function runMinoAgent(url: string): Promise<MinoResult> {
  const apiUrl = process.env.MINO_API_URL;
  const apiKey = process.env.MINO_API_KEY;

  if (!apiUrl || !apiKey) {
    throw new Error("Mino API is not configured.");
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      url,
      followLinks: LINK_KEYWORDS,
      followLinkKeywords: LINK_KEYWORDS,
      extractText: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Mino request failed (${response.status}): ${errorText || "Unknown error"}`
    );
  }

  const payload = (await response.json()) as unknown;
  const pages = extractTextBlocks(payload);

  return {
    pages,
    raw: payload,
  };
}
