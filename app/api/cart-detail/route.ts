import { NextRequest, NextResponse } from "next/server";
import { fetchShareCartDetail, maskSensitiveValue } from "@/lib/postman";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as {
      key?: string;
      language?: string;
      csrf?: string;
      cookie?: string;
    };

    if (!payload.key?.trim()) {
      return NextResponse.json(
        { error: "Missing required field: key" },
        { status: 400 },
      );
    }

    const result = await fetchShareCartDetail({
      key: payload.key.trim(),
      language: payload.language,
      csrf: payload.csrf,
      cookie: payload.cookie,
    });

    return NextResponse.json({
      request: {
        ...result.request,
        headers: Object.fromEntries(
          Object.entries(result.request.headers).map(([key, value]) => [
            key,
            maskSensitiveValue(key, value),
          ]),
        ),
      },
      response: result.response,
      testedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Cart detail lookup failed",
      },
      { status: 500 },
    );
  }
}
