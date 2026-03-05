import { readFileSync } from "node:fs";
import { join } from "node:path";

export type PostmanHeader = {
  key: string;
  value: string;
};

type PostmanQuery = {
  key: string;
  value?: string;
};

type PostmanUrl = {
  raw?: string;
  query?: PostmanQuery[];
};

type PostmanBody = {
  mode?: "raw";
  raw?: string;
};

type PostmanRequest = {
  method: string;
  url: string | PostmanUrl;
  header?: PostmanHeader[];
  body?: PostmanBody;
};

type PostmanItem = {
  name: string;
  request: PostmanRequest;
};

type PostmanCollection = {
  item: PostmanItem[];
};

export type EndpointTemplate = {
  id: string;
  name: string;
  method: string;
  url: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  bodyRaw: string | null;
  bodyJson: unknown;
};

export type ReplayInput = {
  id: string;
  csrf?: string;
  cookie?: string;
  bodyRaw?: string;
  url?: string;
  useCapturedAuth?: boolean;
};

const COLLECTION_PATH = join(process.cwd(), "postmanLog.json");

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function getUrl(url: string | PostmanUrl): string {
  if (typeof url === "string") {
    return url;
  }

  return url.raw ?? "";
}

function getQuery(url: string | PostmanUrl): Record<string, string> {
  if (typeof url === "string") {
    return {};
  }

  const queryEntries = url.query ?? [];
  return Object.fromEntries(
    queryEntries.map((entry) => [entry.key, entry.value ?? ""]),
  );
}

function getHeaders(headers: PostmanHeader[] = []): Record<string, string> {
  return Object.fromEntries(headers.map((header) => [header.key, header.value]));
}

function parseBody(raw: string | null): unknown {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function loadTemplates(): EndpointTemplate[] {
  const raw = readFileSync(COLLECTION_PATH, "utf8");
  const collection = JSON.parse(raw) as PostmanCollection;

  return collection.item.map((item) => {
    const bodyRaw = item.request.body?.mode === "raw" ? (item.request.body.raw ?? "") : null;

    return {
      id: slugify(item.name),
      name: item.name,
      method: item.request.method,
      url: getUrl(item.request.url),
      query: getQuery(item.request.url),
      headers: getHeaders(item.request.header),
      bodyRaw,
      bodyJson: parseBody(bodyRaw),
    };
  });
}

export function getTemplateById(id: string): EndpointTemplate | undefined {
  return loadTemplates().find((endpoint) => endpoint.id === id);
}

export function maskSensitiveValue(key: string, value: string): string {
  const normalized = key.toLowerCase();
  if (!["cookie", "csrf", "wise-groupid"].includes(normalized)) {
    return value;
  }

  if (value.length <= 12) {
    return "********";
  }

  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

function stripAuthHeaders(headers: Record<string, string>): Record<string, string> {
  const next = { ...headers };
  for (const key of Object.keys(next)) {
    const normalized = key.toLowerCase();
    if (normalized === "cookie" || normalized === "csrf" || normalized === "wise-groupid") {
      delete next[key];
    }
  }
  return next;
}

export async function replayRequest(input: ReplayInput) {
  const template = getTemplateById(input.id);

  if (!template) {
    throw new Error(`Unknown endpoint id: ${input.id}`);
  }

  const headers = input.useCapturedAuth === false
    ? stripAuthHeaders(template.headers)
    : { ...template.headers };

  if (input.csrf) {
    headers.csrf = input.csrf;
  }

  if (input.cookie) {
    headers.Cookie = input.cookie;
  }

  const url = input.url?.trim() ? input.url : template.url;
  const bodyRaw = input.bodyRaw !== undefined ? input.bodyRaw : template.bodyRaw;

  const init: RequestInit = {
    method: template.method,
    headers,
    signal: AbortSignal.timeout(30_000),
  };

  if (bodyRaw && template.method !== "GET") {
    init.body = bodyRaw;
  }

  const startedAt = Date.now();
  const response = await fetch(url, init);
  const durationMs = Date.now() - startedAt;

  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();

  let parsed: unknown = text;
  if (contentType.includes("application/json") || text.trim().startsWith("{") || text.trim().startsWith("[")) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  return {
    template,
    request: {
      method: template.method,
      url,
      headers,
      bodyRaw,
      useCapturedAuth: input.useCapturedAuth !== false,
    },
    response: {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      contentType,
      durationMs,
      body: parsed,
      rawTextPreview: text.slice(0, 1200),
    },
  };
}
