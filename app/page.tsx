"use client";

import { useEffect, useMemo, useState } from "react";

type Template = {
  id: string;
  name: string;
  method: string;
  url: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  bodyRaw: string | null;
  bodyJson: unknown;
};

type ReplayResult = {
  endpoint: {
    id: string;
    name: string;
  };
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    bodyRaw: string | null;
    useCapturedAuth: boolean;
  };
  response: {
    ok: boolean;
    status: number;
    statusText: string;
    contentType: string;
    durationMs: number;
    body: unknown;
    rawTextPreview: string;
  };
  testedAt: string;
};

function pretty(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function Home() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [csrf, setCsrf] = useState("");
  const [cookie, setCookie] = useState("");
  const [urlOverride, setUrlOverride] = useState("");
  const [bodyOverride, setBodyOverride] = useState("");
  const [useCapturedAuth, setUseCapturedAuth] = useState(true);
  const [result, setResult] = useState<ReplayResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [allResults, setAllResults] = useState<ReplayResult[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/templates", { cache: "no-store" });
      const data = (await response.json()) as {
        templates: Template[];
      };
      setTemplates(data.templates);
      setSelectedId(data.templates[0]?.id ?? "");
    })();
  }, []);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedId),
    [templates, selectedId],
  );

  useEffect(() => {
    if (!selectedTemplate) {
      return;
    }

    setUrlOverride(selectedTemplate.url);
    setBodyOverride(selectedTemplate.bodyRaw ?? "");
    setResult(null);
    setError("");
  }, [selectedTemplate]);

  async function replayOne(
    id: string,
    options?: {
      url?: string;
      bodyRaw?: string;
      csrf?: string;
      cookie?: string;
      useCapturedAuth?: boolean;
    },
  ): Promise<ReplayResult> {
    const response = await fetch("/api/replay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        csrf: options?.csrf ?? (csrf.trim() || undefined),
        cookie: options?.cookie ?? (cookie.trim() || undefined),
        url: options?.url ?? (urlOverride.trim() || undefined),
        bodyRaw: options?.bodyRaw ?? bodyOverride,
        useCapturedAuth: options?.useCapturedAuth ?? useCapturedAuth,
      }),
    });

    const data = (await response.json()) as ReplayResult & { error?: string };
    if (!response.ok) {
      throw new Error(data.error ?? `Replay failed with status ${response.status}`);
    }

    return data;
  }

  async function runSelected() {
    if (!selectedTemplate) {
      return;
    }

    setLoading(true);
    setError("");
    try {
      const data = await replayOne(selectedTemplate.id);
      setResult(data);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Replay failed");
    } finally {
      setLoading(false);
    }
  }

  async function runAll() {
    if (!templates.length) {
      return;
    }

    setLoadingAll(true);
    setAllResults([]);
    setError("");

    const runResults: ReplayResult[] = [];
    for (const template of templates) {
      try {
        const data = await replayOne(template.id, {
          url: template.url,
          bodyRaw: template.bodyRaw ?? "",
          useCapturedAuth: true,
        });
        runResults.push(data);
      } catch (runError) {
        setError(runError instanceof Error ? runError.message : "Smoke test failed");
        break;
      }
    }

    setAllResults(runResults);
    setLoadingAll(false);
  }

  const selectedJson = selectedTemplate?.bodyJson ? pretty(selectedTemplate.bodyJson) : "No body";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_10%_10%,#f5fbe8_0%,#f4f7ff_38%,#f2f6f4_100%)] px-4 py-8 text-slate-900 sm:px-6 lg:px-10">
      <main className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section className="card h-fit">
          <p className="eyebrow">Huawei Calculator API</p>
          <h1 className="mt-2 text-3xl font-semibold leading-tight">Endpoint Explorer</h1>
          <p className="mt-3 text-sm text-slate-600">
            Loaded from <code>postmanLog.json</code>. All tests run server-side via Next API routes.
          </p>

          <div className="mt-6 space-y-2">
            {templates.map((template) => {
              const active = template.id === selectedId;
              return (
                <button
                  key={template.id}
                  className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                    active
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                  onClick={() => setSelectedId(template.id)}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{template.name}</span>
                    <span className="method">{template.method}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">{template.id}</p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-6">
          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="eyebrow">Selected Endpoint</p>
                <h2 className="mt-1 text-2xl font-semibold">{selectedTemplate?.name ?? "Loading..."}</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="btn btn-secondary"
                  disabled={loadingAll || loading}
                  onClick={() => {
                    if (!selectedTemplate) {
                      return;
                    }
                    setUrlOverride(selectedTemplate.url);
                    setBodyOverride(selectedTemplate.bodyRaw ?? "");
                    setCsrf("");
                    setCookie("");
                    setUseCapturedAuth(true);
                    setError("");
                  }}
                  type="button"
                >
                  Reset
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={loadingAll || loading}
                  onClick={runAll}
                  type="button"
                >
                  {loadingAll ? "Testing all..." : "Smoke test all 5"}
                </button>
                <button className="btn btn-primary" disabled={loading || loadingAll} onClick={runSelected} type="button">
                  {loading ? "Running..." : "Run selected"}
                </button>
              </div>
            </div>

            {selectedTemplate ? (
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <p className="label">Method and URL</p>
                    <p className="mt-1 text-xs text-slate-700">
                      <span className="method mr-2">{selectedTemplate.method}</span>
                      <code>{selectedTemplate.url}</code>
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <p className="label">Captured Query Params</p>
                    <pre className="code-block mt-1 h-24">{pretty(selectedTemplate.query)}</pre>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <p className="label">Captured Headers (masked)</p>
                    <pre className="code-block mt-1 h-40">{pretty(selectedTemplate.headers)}</pre>
                  </div>

                  <label className="label" htmlFor="url-override">
                    URL Override
                  </label>
                  <textarea
                    className="field h-24"
                    id="url-override"
                    onChange={(event) => setUrlOverride(event.target.value)}
                    value={urlOverride}
                  />

                  <label className="label" htmlFor="body-override">
                    JSON Body Override
                  </label>
                  <textarea
                    className="field h-56"
                    id="body-override"
                    onChange={(event) => setBodyOverride(event.target.value)}
                    value={bodyOverride}
                  />
                </div>

                <div className="space-y-3">
                  <label className="label" htmlFor="csrf-override">
                    CSRF Override (optional)
                  </label>
                  <textarea
                    className="field h-20"
                    id="csrf-override"
                    onChange={(event) => setCsrf(event.target.value)}
                    placeholder="Leave empty to use captured value"
                    value={csrf}
                  />

                  <label className="label" htmlFor="cookie-override">
                    Cookie Override (optional)
                  </label>
                  <textarea
                    className="field h-28"
                    id="cookie-override"
                    onChange={(event) => setCookie(event.target.value)}
                    placeholder="Leave empty to use captured value"
                    value={cookie}
                  />

                  <label className="mt-1 flex items-center gap-2 text-sm font-medium text-slate-700">
                    <input
                      checked={useCapturedAuth}
                      onChange={(event) => setUseCapturedAuth(event.target.checked)}
                      type="checkbox"
                    />
                    Include captured auth headers from postman log
                  </label>

                  <div>
                    <p className="label">Template Body (read-only)</p>
                    <pre className="code-block mt-1 h-48">{selectedJson}</pre>
                  </div>
                </div>
              </div>
            ) : null}

            {error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          </div>

          <div className="card space-y-4">
            <p className="eyebrow">Latest Result</p>
            {result ? (
              <>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className={`status ${result.response.ok ? "status-ok" : "status-fail"}`}>
                    HTTP {result.response.status} {result.response.statusText}
                  </span>
                  <span className="pill">{result.response.durationMs} ms</span>
                  <span className="pill">{result.response.contentType || "unknown content-type"}</span>
                </div>
                <pre className="code-block">{pretty(result.response.body)}</pre>
              </>
            ) : (
              <p className="text-sm text-slate-500">Run one endpoint to see response details.</p>
            )}
          </div>

          <div className="card space-y-3">
            <p className="eyebrow">Smoke Test Summary</p>
            {!allResults.length ? (
              <p className="text-sm text-slate-500">No smoke test run yet.</p>
            ) : (
              <div className="space-y-2">
                {allResults.map((entry) => (
                  <div key={entry.endpoint.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                    <span className="font-medium">{entry.endpoint.name}</span>
                    <div className="flex items-center gap-2">
                      <span className={`status ${entry.response.ok ? "status-ok" : "status-fail"}`}>
                        {entry.response.status}
                      </span>
                      <span className="pill">{entry.response.durationMs} ms</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
