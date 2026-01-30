import { NextResponse } from "next/server";
import { runMinoAgent } from "@/lib/mino";
import { extractRules } from "@/lib/extract";
import { analyzeRules, type UserInfo } from "@/lib/rules";

export const runtime = "nodejs";

type AnalyzeRequest = {
  applicationUrl: string;
  userInfo: UserInfo;
  documents?: { filename: string; text: string }[];
  extraRequiredDocs?: string[];
};

export async function POST(request: Request) {
  try {
    let applicationUrl = "";
    let userInfo: UserInfo = {};
    let uploadedDocs: { name: string; text: string }[] = [];
    let extraRequiredDocs: string[] = [];
    const body = (await request.json()) as Partial<AnalyzeRequest>;
    applicationUrl = typeof body.applicationUrl === "string" ? body.applicationUrl : "";
    userInfo = body.userInfo ?? {};
    if (Array.isArray(body.documents)) {
      uploadedDocs = body.documents
        .filter((doc) => doc && typeof doc.filename === "string" && typeof doc.text === "string")
        .map((doc) => ({ name: doc.filename, text: doc.text }));
    }
    if (Array.isArray(body.extraRequiredDocs)) {
      extraRequiredDocs = body.extraRequiredDocs.filter((item) => typeof item === "string");
    }

    if (!applicationUrl) {
      return NextResponse.json(
        { error: "applicationUrl is required." },
        { status: 400 }
      );
    }

    if (typeof userInfo !== "object" || userInfo === null) {
      userInfo = {};
    }

    const { age, income, studentStatus, country } = userInfo as UserInfo;
    if (age !== undefined && (!Number.isFinite(age) || age < 0)) {
      return NextResponse.json(
        { error: "age must be a non-negative number." },
        { status: 400 }
      );
    }
    if (income !== undefined && (!Number.isFinite(income) || income < 0)) {
      return NextResponse.json(
        { error: "income must be a non-negative number." },
        { status: 400 }
      );
    }
    if (studentStatus !== undefined && typeof studentStatus !== "string") {
      return NextResponse.json(
        { error: "studentStatus must be a string." },
        { status: 400 }
      );
    }
    if (country !== undefined && typeof country !== "string") {
      return NextResponse.json(
        { error: "country must be a string." },
        { status: 400 }
      );
    }

    try {
      new URL(applicationUrl);
    } catch {
      return NextResponse.json(
        { error: "applicationUrl must be a valid URL." },
        { status: 400 }
      );
    }

    if (uploadedDocs.length > 5) {
      return NextResponse.json(
        { error: "You can upload up to 5 documents." },
        { status: 400 }
      );
    }

    const totalText = uploadedDocs.reduce((sum, doc) => sum + doc.text.length, 0);
    if (totalText > 120000) {
      return NextResponse.json(
        { error: "Uploaded document text exceeds the allowed limit." },
        { status: 400 }
      );
    }

    uploadedDocs = uploadedDocs
      .map((doc) => ({ ...doc, text: doc.text.trim() }))
      .filter((doc) => doc.text.length > 0 && doc.text.length < 40000);

    const minoResult = await runMinoAgent(applicationUrl);
    const rules = extractRules(minoResult);
    const evaluation = analyzeRules(rules, userInfo, uploadedDocs, extraRequiredDocs);

    return NextResponse.json({
      reasons: evaluation.reasons,
      likelyReasons: evaluation.likelyReasons,
      recommendations: evaluation.recommendations,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to analyze application.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
