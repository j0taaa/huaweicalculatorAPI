import { NextResponse } from "next/server";
import { loadTemplates, maskSensitiveValue } from "@/lib/postman";

export const dynamic = "force-dynamic";

export async function GET() {
  const templates = loadTemplates().map((template) => ({
    ...template,
    headers: Object.fromEntries(
      Object.entries(template.headers).map(([key, value]) => [
        key,
        maskSensitiveValue(key, value),
      ]),
    ),
  }));

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    count: templates.length,
    templates,
  });
}
