import { NextRequest, NextResponse } from "next/server";
import { replayRequest, maskSensitiveValue } from "@/lib/postman";
import { detectHuaweiAuthIssue } from "@/lib/huawei-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as {
      id?: string;
      csrf?: string;
      cookie?: string;
      bodyRaw?: string;
      url?: string;
      useCapturedAuth?: boolean;
    };

    if (!payload.id) {
      return NextResponse.json(
        { error: "Missing required field: id" },
        { status: 400 },
      );
    }

    const result = await replayRequest({
      id: payload.id,
      csrf: payload.csrf,
      cookie: payload.cookie,
      bodyRaw: payload.bodyRaw,
      url: payload.url,
      useCapturedAuth: payload.useCapturedAuth,
    });

    const authIssue = detectHuaweiAuthIssue(result.response);
    if (authIssue && payload.useCapturedAuth !== false) {
      return NextResponse.json(
        {
          error: "Huawei session expired. Open Session and paste a fresh cookie or HWS_INTL_ID.",
          authExpired: true,
          authCode: authIssue.code,
          authMessage: authIssue.message,
          endpoint: {
            id: result.template.id,
            name: result.template.name,
          },
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
        },
        { status: 401 },
      );
    }

    return NextResponse.json({
      endpoint: {
        id: result.template.id,
        name: result.template.name,
      },
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
        error: error instanceof Error ? error.message : "Replay failed",
      },
      { status: 500 },
    );
  }
}
