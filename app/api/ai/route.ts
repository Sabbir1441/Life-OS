import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/verify-auth";

const rateMap = new Map<string, { count: number; reset: number }>();
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(uid: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(uid);
  if (!entry || now > entry.reset) {
    rateMap.set(uid, { count: 1, reset: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  const decoded = await verifyAuthToken(req.headers.get("authorization"));
  const hasAdmin = Boolean(process.env.FIREBASE_ADMIN_PRIVATE_KEY);

  if (hasAdmin && !decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasAdmin) {
    if (!req.headers.get("authorization")?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Login required" }, { status: 401 });
    }
  }

  const uid = decoded?.uid ?? "client";

  if (!checkRateLimit(uid)) {
    return NextResponse.json({ error: "Rate limit — 1 min pore try koro" }, { status: 429 });
  }

  try {
    const { system, messages } = await req.json();
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: system || "",
        messages: messages || [],
      }),
    });
    const data = await response.json();
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
