import {
  convertCartOnServer,
  isHuaweiAccessError,
  isHuaweiAuthError,
  type CartConversionRequest,
} from "../lib/cart-convert-server";
import { detectHuaweiAccessIssue, detectHuaweiAuthIssue } from "../lib/huawei-auth";
import { fetchShareCartDetail, maskSensitiveValue, replayRequest } from "../lib/postman";

declare const Bun: {
  serve(options: {
    port: number;
    hostname: string;
    fetch(request: Request): Response | Promise<Response>;
  }): unknown;
};

const DEFAULT_PORT = 4318;
const port = Number.parseInt(process.env.HWC_LOCAL_PROXY_PORT ?? `${DEFAULT_PORT}`, 10) || DEFAULT_PORT;

type JsonRecord = Record<string, unknown>;

function json(body: JsonRecord, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "cache-control": "no-store",
      "content-type": "application/json",
    },
  });
}

function maskHeaders(headers: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, maskSensitiveValue(key, value)]),
  );
}

async function handleReplay(request: Request) {
  const payload = await request.json() as {
    id?: string;
    csrf?: string;
    cookie?: string;
    bodyRaw?: string;
    url?: string;
    useCapturedAuth?: boolean;
  };

  if (!payload.id) {
    return json({ error: "Missing required field: id" }, 400);
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
    return json({
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
        headers: maskHeaders(result.request.headers),
      },
      response: result.response,
      testedAt: new Date().toISOString(),
    }, 401);
  }

  const accessIssue = detectHuaweiAccessIssue(result.response);
  if (accessIssue) {
    return json({
      error: accessIssue.message,
      accessBlocked: true,
      accessCode: accessIssue.code,
      endpoint: {
        id: result.template.id,
        name: result.template.name,
      },
      request: {
        ...result.request,
        headers: maskHeaders(result.request.headers),
      },
      response: result.response,
      testedAt: new Date().toISOString(),
    }, 403);
  }

  return json({
    endpoint: {
      id: result.template.id,
      name: result.template.name,
    },
    request: {
      ...result.request,
      headers: maskHeaders(result.request.headers),
    },
    response: result.response,
    testedAt: new Date().toISOString(),
  });
}

async function handleCartDetail(request: Request) {
  const payload = await request.json() as {
    key?: string;
    language?: string;
    csrf?: string;
    cookie?: string;
  };

  if (!payload.key?.trim()) {
    return json({ error: "Missing required field: key" }, 400);
  }

  const result = await fetchShareCartDetail({
    key: payload.key.trim(),
    language: payload.language,
    csrf: payload.csrf,
    cookie: payload.cookie,
  });

  const authIssue = detectHuaweiAuthIssue(result.response);
  if (authIssue) {
    return json({
      error: "Huawei session expired. Open Session and paste a fresh cookie or HWS_INTL_ID.",
      authExpired: true,
      authCode: authIssue.code,
      authMessage: authIssue.message,
      request: {
        ...result.request,
        headers: maskHeaders(result.request.headers),
      },
      response: result.response,
      testedAt: new Date().toISOString(),
    }, 401);
  }

  const accessIssue = detectHuaweiAccessIssue(result.response);
  if (accessIssue) {
    return json({
      error: accessIssue.message,
      accessBlocked: true,
      accessCode: accessIssue.code,
      request: {
        ...result.request,
        headers: maskHeaders(result.request.headers),
      },
      response: result.response,
      testedAt: new Date().toISOString(),
    }, 403);
  }

  return json({
    request: {
      ...result.request,
      headers: maskHeaders(result.request.headers),
    },
    response: result.response,
    testedAt: new Date().toISOString(),
  });
}

async function handleCartConvert(request: Request) {
  const payload = await request.json() as {
    key?: string;
    cookie?: string;
    csrf?: string;
    conversion?: CartConversionRequest["conversion"];
  };

  if (!payload.key?.trim()) {
    return json({ error: "Missing required field: key" }, 400);
  }

  if (!payload.conversion || typeof payload.conversion !== "object") {
    return json({ error: "Missing required field: conversion" }, 400);
  }

  try {
    const result = await convertCartOnServer({
      key: payload.key.trim(),
      cookie: payload.cookie,
      csrf: payload.csrf,
      conversion: payload.conversion,
    });
    return json(result);
  } catch (error) {
    if (isHuaweiAuthError(error)) {
      return json({
        error: error.message,
        authExpired: true,
        authCode: error.code,
        authMessage: error.authMessage,
      }, 401);
    }

    if (isHuaweiAccessError(error)) {
      return json({
        error: error.message,
        accessBlocked: true,
        accessCode: error.code,
      }, 403);
    }

    return json({
      error: error instanceof Error ? error.message : "Cart conversion failed",
    }, 500);
  }
}

Bun.serve({
  port,
  hostname: "127.0.0.1",
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return json({});
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        ok: true,
        service: "huawei-local-proxy",
        port,
      });
    }

    if (request.method === "POST" && url.pathname === "/replay") {
      return handleReplay(request);
    }

    if (request.method === "POST" && url.pathname === "/cart-detail") {
      return handleCartDetail(request);
    }

    if (request.method === "POST" && url.pathname === "/cart-convert") {
      return handleCartConvert(request);
    }

    return json({ error: "Not found" }, 404);
  },
});

console.log(`Huawei local proxy listening on http://127.0.0.1:${port}`);
