import { NextRequest, NextResponse } from "next/server";
import {
  convertCartOnServer,
  isHuaweiAuthError,
  type CartConversionRequest,
} from "@/lib/cart-convert-server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as {
      key?: string;
      cookie?: string;
      csrf?: string;
      conversion?: CartConversionRequest["conversion"];
    };

    if (!payload.key?.trim()) {
      return NextResponse.json(
        { error: "Missing required field: key" },
        { status: 400 },
      );
    }

    if (!payload.conversion || typeof payload.conversion !== "object") {
      return NextResponse.json(
        { error: "Missing required field: conversion" },
        { status: 400 },
      );
    }

    if (payload.conversion.kind === "billing") {
      if (payload.conversion.targetPricingMode !== "ONDEMAND" && payload.conversion.targetPricingMode !== "RI") {
        return NextResponse.json(
          { error: "Invalid billing conversion target" },
          { status: 400 },
        );
      }
    } else if (payload.conversion.kind === "region") {
      if (!payload.conversion.targetRegion?.trim()) {
        return NextResponse.json(
          { error: "Missing required field: conversion.targetRegion" },
          { status: 400 },
        );
      }
    } else {
      return NextResponse.json(
        { error: "Invalid conversion kind" },
        { status: 400 },
      );
    }

    const result = await convertCartOnServer({
      key: payload.key.trim(),
      cookie: payload.cookie,
      csrf: payload.csrf,
      conversion: payload.conversion,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (isHuaweiAuthError(error)) {
      return NextResponse.json(
        {
          error: error.message,
          authExpired: true,
          authCode: error.code,
          authMessage: error.authMessage,
        },
        { status: 401 },
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Cart conversion failed",
      },
      { status: 500 },
    );
  }
}
