import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type HttpRequestInput = {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string | null;
  timeoutMs?: number;
};

export type HttpResponseSnapshot = {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  contentType: string;
  bodyText: string;
  durationMs: number;
};

function normalizeHeaderName(name: string): string {
  return name.trim().toLowerCase();
}

function parseHeaderBlocks(rawHeaders: string): {
  status: number;
  statusText: string;
  headers: Record<string, string>;
} {
  const blocks = rawHeaders
    .split(/\r?\n\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  const lastBlock = blocks.at(-1) ?? "";
  const lines = lastBlock.split(/\r?\n/).filter(Boolean);
  const statusLine = lines[0] ?? "";
  const statusMatch = statusLine.match(/^HTTP\/\S+\s+(\d+)(?:\s+(.*))?$/i);
  const status = Number.parseInt(statusMatch?.[1] ?? "0", 10) || 0;
  const statusText = statusMatch?.[2]?.trim() ?? "";

  const headers: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const key = normalizeHeaderName(line.slice(0, separatorIndex));
    const value = line.slice(separatorIndex + 1).trim();
    headers[key] = value;
  }

  return { status, statusText, headers };
}

function shouldProxyRequest(url: string): boolean {
  const proxy = getHuaweiProxy();
  if (!proxy) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return parsed.hostname.endsWith("huaweicloud.com");
  } catch {
    return false;
  }
}

function getHuaweiProxy(): string {
  const configured = process.env.HWC_SOCKS5_PROXY?.trim();
  if (configured) {
    return configured;
  }

  if (process.env.NODE_ENV === "production") {
    return "socks5h://172.28.0.1:40001";
  }

  return "";
}

async function sendCurlRequest(input: HttpRequestInput): Promise<HttpResponseSnapshot> {
  const tempDir = await mkdtemp(join(tmpdir(), "huawei-http-"));
  const headerPath = join(tempDir, "headers.txt");
  const bodyPath = join(tempDir, "body.txt");
  const proxy = getHuaweiProxy();
  const timeoutSeconds = Math.max(1, Math.ceil((input.timeoutMs ?? 30_000) / 1000));

  const args = [
    "--silent",
    "--show-error",
    "--location",
    "--request",
    input.method,
    "--url",
    input.url,
    "--dump-header",
    headerPath,
    "--output",
    bodyPath,
    "--max-time",
    String(timeoutSeconds),
    "--connect-timeout",
    String(Math.min(timeoutSeconds, 15)),
  ];

  if (proxy) {
    args.push("--proxy", proxy);
  }

  for (const [key, value] of Object.entries(input.headers ?? {})) {
    args.push("--header", `${key}: ${value}`);
  }

  if (input.body && input.method !== "GET") {
    args.push("--data-raw", input.body);
  }

  const startedAt = Date.now();

  try {
    await execFileAsync("curl", args, { maxBuffer: 10 * 1024 * 1024 });
    const [rawHeaders, bodyText] = await Promise.all([
      readFile(headerPath, "utf8"),
      readFile(bodyPath, "utf8"),
    ]);
    const parsedHeaders = parseHeaderBlocks(rawHeaders);
    const contentType = parsedHeaders.headers["content-type"] ?? "";

    return {
      ok: parsedHeaders.status >= 200 && parsedHeaders.status < 300,
      status: parsedHeaders.status,
      statusText: parsedHeaders.statusText,
      headers: parsedHeaders.headers,
      contentType,
      bodyText,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function sendFetchRequest(input: HttpRequestInput): Promise<HttpResponseSnapshot> {
  const startedAt = Date.now();
  const response = await fetch(input.url, {
    method: input.method,
    headers: input.headers,
    body: input.body ?? undefined,
    signal: AbortSignal.timeout(input.timeoutMs ?? 30_000),
  });
  const bodyText = await response.text();

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
    contentType: response.headers.get("content-type") ?? "",
    bodyText,
    durationMs: Date.now() - startedAt,
  };
}

export async function sendHttpRequest(input: HttpRequestInput): Promise<HttpResponseSnapshot> {
  if (shouldProxyRequest(input.url)) {
    return sendCurlRequest(input);
  }

  return sendFetchRequest(input);
}
