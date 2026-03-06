"use client";

import { useEffect, useState } from "react";

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

type CartSummary = {
  key: string;
  name: string;
  updateTime: number;
  billingMode?: string;
  totalPrice?: {
    amount?: number;
    originalAmount?: number;
  };
};

type ProductFlavor = {
  resourceSpecCode: string;
  cloudServiceType?: string;
  productSpecSysDesc?: string;
  productSpec?: string;
  productSpecDesc?: string;
};

type PricePayload = {
  regionId: string;
  chargingMode: number;
  periodType: number;
  periodNum: number;
  subscriptionNum: number;
  siteCode: string;
  productInfos: Array<Record<string, unknown>>;
};

type EditCartPayload = {
  billingMode: string;
  cartListData: Array<{
    buyUrl?: string;
    rewriteValue?: Record<string, unknown>;
    selectedProduct?: Record<string, unknown>;
  }>;
  name: string;
  totalPrice: {
    amount: number;
    discountAmount: number;
    originalAmount: number;
  };
};

function pretty(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, 2);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function formatDate(value?: number): string {
  if (!value) {
    return "Unknown time";
  }

  return new Date(value).toLocaleString();
}

function findTemplate(templates: Template[], id: string): Template | undefined {
  return templates.find((template) => template.id === id);
}

function getCatalogFlavors(body: unknown): ProductFlavor[] {
  if (!body || typeof body !== "object") {
    return [];
  }

  const product = (body as { product?: Record<string, unknown> }).product;
  if (!product || typeof product !== "object") {
    return [];
  }

  const vmList = product.ec2_vm;
  if (!Array.isArray(vmList)) {
    return [];
  }

  return vmList as ProductFlavor[];
}

function getCartList(body: unknown): CartSummary[] {
  if (!body || typeof body !== "object") {
    return [];
  }

  const lists = (body as { lists?: unknown }).lists;
  if (!Array.isArray(lists)) {
    return [];
  }

  return lists as CartSummary[];
}

function extractMinimalCookie(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }

  if (!trimmed.includes("=") && !trimmed.includes(";")) {
    return `HWS_INTL_ID=${trimmed}`;
  }

  if (trimmed.startsWith("HWS_INTL_ID=") && !trimmed.includes(";")) {
    return trimmed;
  }

  const parts = trimmed.split(/;\s*/);
  for (const part of parts) {
    if (part.startsWith("HWS_INTL_ID=")) {
      return part;
    }
  }

  return trimmed;
}

export default function Home() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [appError, setAppError] = useState("");

  const [cookie, setCookie] = useState("");
  const [csrf, setCsrf] = useState("");
  const [sessionOpen, setSessionOpen] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  const [cartName, setCartName] = useState("Working cart");
  const [selectedCartKey, setSelectedCartKey] = useState("");
  const [fillCartName, setFillCartName] = useState("Starter ECS cart");
  const [fillCartDescription, setFillCartDescription] = useState("Starter ECS config");

  const [catalogRegion, setCatalogRegion] = useState("ap-southeast-3");
  const [catalogResult, setCatalogResult] = useState<ReplayResult | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);

  const [priceRegion, setPriceRegion] = useState("sa-brazil-1");
  const [priceSpec, setPriceSpec] = useState("x1.2u.16g.linux");
  const [priceDiskType, setPriceDiskType] = useState("GPSSD");
  const [priceDiskSize, setPriceDiskSize] = useState("40");
  const [priceHours, setPriceHours] = useState("744");
  const [priceResult, setPriceResult] = useState<ReplayResult | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);

  const [cartList, setCartList] = useState<CartSummary[]>([]);
  const [cartListLoading, setCartListLoading] = useState(false);
  const [cartListResult, setCartListResult] = useState<ReplayResult | null>(null);

  const [createResult, setCreateResult] = useState<ReplayResult | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  const [fillResult, setFillResult] = useState<ReplayResult | null>(null);
  const [fillLoading, setFillLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/templates", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Failed to load templates: ${response.status}`);
        }

        const data = (await response.json()) as { templates: Template[] };
        setTemplates(data.templates);

        const priceTemplate = findTemplate(data.templates, "get-price");
        const catalogTemplate = findTemplate(data.templates, "get-product-options-and-info");
        const editTemplate = findTemplate(data.templates, "edit-cart");

        const priceBody = priceTemplate?.bodyJson as PricePayload | undefined;
        if (priceBody?.regionId) {
          setPriceRegion(priceBody.regionId);
          const vmProduct = priceBody.productInfos[0];
          const diskProduct = priceBody.productInfos[1];
          if (typeof vmProduct?.resourceSpecCode === "string") {
            setPriceSpec(vmProduct.resourceSpecCode);
          }
          if (typeof diskProduct?.resourceSpecCode === "string") {
            setPriceDiskType(diskProduct.resourceSpecCode);
          }
          if (typeof diskProduct?.resourceSize === "number") {
            setPriceDiskSize(String(diskProduct.resourceSize));
          }
          if (typeof vmProduct?.usageValue === "number") {
            setPriceHours(String(vmProduct.usageValue));
          }
        }

        if (catalogTemplate) {
          const url = new URL(catalogTemplate.url);
          const region = url.searchParams.get("region");
          if (region) {
            setCatalogRegion(region);
          }
        }

        if (editTemplate && typeof editTemplate.bodyJson === "object" && editTemplate.bodyJson) {
          const editBody = editTemplate.bodyJson as EditCartPayload;
          if (editBody.name) {
            setFillCartName(editBody.name);
          }
          const description = editBody.cartListData[0]?.selectedProduct?.description;
          if (typeof description === "string") {
            setFillCartDescription(description);
          }
        }
      } catch (error) {
        setAppError(error instanceof Error ? error.message : "Failed to load app");
      } finally {
        setLoadingTemplates(false);
      }
    })();
  }, []);

  useEffect(() => {
    const storedCookie = window.localStorage.getItem("hwc-cookie");
    const storedCsrf = window.localStorage.getItem("hwc-csrf");
    if (storedCookie) {
      setCookie(storedCookie);
    }
    if (storedCsrf) {
      setCsrf(storedCsrf);
    }
    setSessionReady(true);
  }, []);

  useEffect(() => {
    if (!sessionReady) {
      return;
    }

    window.localStorage.setItem("hwc-cookie", cookie);
    window.localStorage.setItem("hwc-csrf", csrf);
  }, [cookie, csrf, sessionReady]);

  const normalizedCookie = extractMinimalCookie(cookie);

  async function replayOne(
    id: string,
    options?: {
      url?: string;
      bodyRaw?: string;
    },
  ): Promise<ReplayResult> {
    const response = await fetch("/api/replay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        url: options?.url,
        bodyRaw: options?.bodyRaw,
        cookie: normalizedCookie || undefined,
        csrf: csrf.trim() || undefined,
        useCapturedAuth: true,
      }),
    });

    const data = (await response.json()) as ReplayResult & { error?: string };
    if (!response.ok) {
      throw new Error(data.error ?? `Replay failed with status ${response.status}`);
    }

    return data;
  }

  async function refreshCarts() {
    setCartListLoading(true);
    setAppError("");

    try {
      const result = await replayOne("get-all-carts");
      setCartListResult(result);
      const carts = getCartList(result.response.body);
      setCartList(carts);

      if (!selectedCartKey && carts[0]?.key) {
        setSelectedCartKey(carts[0].key);
        setFillCartName(carts[0].name || fillCartName);
      }
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "Failed to load carts");
    } finally {
      setCartListLoading(false);
    }
  }

  async function createCart() {
    const template = findTemplate(templates, "create-cart");
    if (!template || !template.bodyJson || typeof template.bodyJson !== "object") {
      setAppError("Create cart template is missing");
      return;
    }

    setCreateLoading(true);
    setAppError("");

    try {
      const payload = cloneJson(template.bodyJson as Record<string, unknown>);
      payload.name = cartName.trim() || "Working cart";

      const result = await replayOne("create-cart", {
        bodyRaw: JSON.stringify(payload),
      });

      setCreateResult(result);
      const key = (result.response.body as { data?: string })?.data;
      if (typeof key === "string") {
        setSelectedCartKey(key);
        setFillCartName(payload.name as string);
      }
      await refreshCarts();
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "Failed to create cart");
    } finally {
      setCreateLoading(false);
    }
  }

  async function fillCartWithSample() {
    const template = findTemplate(templates, "edit-cart");
    if (!template || !template.bodyJson || typeof template.bodyJson !== "object") {
      setAppError("Edit cart template is missing");
      return;
    }

    if (!selectedCartKey.trim()) {
      setAppError("Choose or enter a cart key first");
      return;
    }

    setFillLoading(true);
    setAppError("");

    try {
      const payload = cloneJson(template.bodyJson as EditCartPayload);
      payload.name = fillCartName.trim() || payload.name;

      const draft = payload.cartListData[0];
      if (draft?.selectedProduct) {
        draft.selectedProduct.description = fillCartDescription.trim() || "Starter ECS config";
        draft.selectedProduct._customTitle = fillCartName.trim() || payload.name;
        draft.selectedProduct.timeTag = Date.now();
      }

      if (draft?.rewriteValue) {
        draft.rewriteValue.global_DESCRIPTION = fillCartDescription.trim() || "Starter ECS config";
      }

      const url = new URL(template.url);
      url.searchParams.set("key", selectedCartKey.trim());

      const result = await replayOne("edit-cart", {
        url: url.toString(),
        bodyRaw: JSON.stringify(payload),
      });

      setFillResult(result);
      await refreshCarts();
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "Failed to update cart");
    } finally {
      setFillLoading(false);
    }
  }

  async function loadCatalog() {
    const template = findTemplate(templates, "get-product-options-and-info");
    if (!template) {
      setAppError("Product info template is missing");
      return;
    }

    setCatalogLoading(true);
    setAppError("");

    try {
      const url = new URL(template.url);
      url.searchParams.set("region", catalogRegion.trim() || "ap-southeast-3");

      const result = await replayOne("get-product-options-and-info", {
        url: url.toString(),
      });

      setCatalogResult(result);
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "Failed to load catalog");
    } finally {
      setCatalogLoading(false);
    }
  }

  async function estimatePrice() {
    const template = findTemplate(templates, "get-price");
    if (!template || !template.bodyJson || typeof template.bodyJson !== "object") {
      setAppError("Price template is missing");
      return;
    }

    setPriceLoading(true);
    setAppError("");

    try {
      const payload = cloneJson(template.bodyJson as PricePayload);
      const hours = Number.parseInt(priceHours, 10) || 744;
      const diskSize = Number.parseInt(priceDiskSize, 10) || 40;

      payload.regionId = priceRegion.trim() || payload.regionId;
      payload.productInfos[0].resourceSpecCode = priceSpec.trim() || payload.productInfos[0].resourceSpecCode;
      payload.productInfos[0].usageValue = hours;
      payload.productInfos[1].resourceSpecCode = priceDiskType.trim() || payload.productInfos[1].resourceSpecCode;
      payload.productInfos[1].resourceSize = diskSize;
      payload.productInfos[1].usageValue = hours;

      const result = await replayOne("get-price", {
        bodyRaw: JSON.stringify(payload),
      });

      setPriceResult(result);
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "Failed to estimate price");
    } finally {
      setPriceLoading(false);
    }
  }

  const catalogFlavors = getCatalogFlavors(catalogResult?.response.body).slice(0, 12);
  const priceBody = priceResult?.response.body as
    | { amount?: number; currency?: string; originalAmount?: number }
    | undefined;
  const latestCartKey = (createResult?.response.body as { data?: string } | undefined)?.data;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fbf8ee_0%,#f4f9f7_30%,#eff5ff_100%)] px-4 py-8 text-slate-900 sm:px-6 lg:px-10">
      <button
        className="session-toggle"
        onClick={() => setSessionOpen((open) => !open)}
        type="button"
      >
        Session
      </button>

      {sessionOpen ? (
        <aside className="session-panel">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Shared Session</p>
              <h2 className="mt-1 text-xl font-semibold">Used by every action</h2>
            </div>
            <button className="text-sm text-slate-500" onClick={() => setSessionOpen(false)} type="button">
              Close
            </button>
          </div>

          <label className="label mt-4" htmlFor="session-cookie">
            Cookie or HWS_INTL_ID
          </label>
          <textarea
            className="field h-32"
            id="session-cookie"
            onChange={(event) => setCookie(event.target.value)}
            placeholder="Paste the full cookie string, HWS_INTL_ID=..., or only the HWS_INTL_ID value."
            value={cookie}
          />

          <label className="label mt-3" htmlFor="session-csrf">
            CSRF
          </label>
          <input
            className="field"
            id="session-csrf"
            onChange={(event) => setCsrf(event.target.value)}
            placeholder="Optional override"
            value={csrf}
          />

          <p className="mt-3 text-xs text-slate-500">
            The app auto-reduces this to the minimal cookie needed for cart APIs: <code>HWS_INTL_ID=...</code>.
            If empty, it falls back to the captured session inside <code>postmanLog.json</code>.
          </p>

          {normalizedCookie ? (
            <div className="result-strip mt-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Using</p>
              <p className="mt-1 break-all font-mono text-xs text-slate-700">{normalizedCookie}</p>
            </div>
          ) : null}
        </aside>
      ) : null}

      <main className="mx-auto max-w-7xl space-y-6">
        <section className="hero-card overflow-hidden">
          <div className="hero-grid">
            <div>
              <p className="eyebrow">Huawei Calculator</p>
              <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
                Turn the captured API into a tool you can actually operate.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
                Create carts, load existing shared carts, fill a cart with the captured ECS sample, estimate price,
                and browse available flavors. The raw API still powers everything, but the UI is task-first.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="metric-card">
                <p className="metric-label">Endpoints</p>
                <p className="metric-value">{templates.length || "-"}</p>
              </div>
              <div className="metric-card">
                <p className="metric-label">Session</p>
                <p className="metric-value">{cookie ? "Custom" : "Captured"}</p>
              </div>
              <div className="metric-card">
                <p className="metric-label">Main Host</p>
                <p className="metric-value text-lg">test.hwctools.site</p>
              </div>
            </div>
          </div>

          {appError ? (
            <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {appError}
            </p>
          ) : null}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="card space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Carts</p>
                <h2 className="mt-1 text-2xl font-semibold">Create and manage share carts</h2>
              </div>
              <button className="btn btn-secondary" disabled={cartListLoading} onClick={() => void refreshCarts()} type="button">
                {cartListLoading ? "Refreshing..." : "Refresh carts"}
              </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="soft-panel">
                <p className="section-title">Create cart</p>
                <label className="label mt-3" htmlFor="cart-name">
                  Cart name
                </label>
                <input
                  className="field"
                  id="cart-name"
                  onChange={(event) => setCartName(event.target.value)}
                  placeholder="Ex: Brazil pilot"
                  value={cartName}
                />
                <button className="btn btn-primary mt-4" disabled={createLoading || loadingTemplates} onClick={() => void createCart()} type="button">
                  {createLoading ? "Creating..." : "Create cart"}
                </button>

                {latestCartKey ? (
                  <div className="result-strip mt-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Created key</p>
                    <p className="mt-1 break-all font-mono text-sm text-slate-700">{latestCartKey}</p>
                  </div>
                ) : null}
              </div>

              <div className="soft-panel">
                <p className="section-title">Fill a cart with the ECS sample</p>
                <label className="label mt-3" htmlFor="selected-cart-key">
                  Cart key
                </label>
                <input
                  className="field"
                  id="selected-cart-key"
                  onChange={(event) => setSelectedCartKey(event.target.value)}
                  placeholder="Choose from the list or paste a key"
                  value={selectedCartKey}
                />

                <label className="label mt-3" htmlFor="fill-cart-name">
                  Cart title
                </label>
                <input
                  className="field"
                  id="fill-cart-name"
                  onChange={(event) => setFillCartName(event.target.value)}
                  value={fillCartName}
                />

                <label className="label mt-3" htmlFor="fill-cart-description">
                  Description
                </label>
                <input
                  className="field"
                  id="fill-cart-description"
                  onChange={(event) => setFillCartDescription(event.target.value)}
                  value={fillCartDescription}
                />

                <button className="btn btn-primary mt-4" disabled={fillLoading || loadingTemplates} onClick={() => void fillCartWithSample()} type="button">
                  {fillLoading ? "Saving..." : "Write sample config"}
                </button>
              </div>
            </div>

            <div>
              <p className="section-title">Existing carts</p>
              {cartList.length ? (
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  {cartList.map((cart) => (
                    <button
                      key={cart.key}
                      className={`cart-card ${selectedCartKey === cart.key ? "cart-card-active" : ""}`}
                      onClick={() => {
                        setSelectedCartKey(cart.key);
                        setFillCartName(cart.name || fillCartName);
                      }}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">{cart.name || "Untitled cart"}</p>
                          <p className="mt-1 text-xs text-slate-500">{formatDate(cart.updateTime)}</p>
                        </div>
                        <span className="pill">{cart.totalPrice?.amount ?? 0}</span>
                      </div>
                      <p className="mt-3 break-all font-mono text-xs text-slate-600">{cart.key}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">
                  {cartListResult ? "No carts returned." : "Load carts to browse and pick a key."}
                </p>
              )}
            </div>
          </div>

          <div className="card space-y-4">
            <p className="eyebrow">Recent Actions</p>
            <div className="space-y-3">
              {createResult ? (
                <div className="result-strip">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">Create cart</p>
                    <span className={`status ${createResult.response.ok ? "status-ok" : "status-fail"}`}>
                      {createResult.response.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">Create a new empty share cart with a human-readable name.</p>
                </div>
              ) : null}

              {fillResult ? (
                <div className="result-strip">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">Write sample config</p>
                    <span className={`status ${fillResult.response.ok ? "status-ok" : "status-fail"}`}>
                      {fillResult.response.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    Pushes the captured ECS sample into the selected cart key.
                  </p>
                </div>
              ) : null}

              {cartListResult ? (
                <div className="result-strip">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">Load carts</p>
                    <span className={`status ${cartListResult.response.ok ? "status-ok" : "status-fail"}`}>
                      {cartListResult.response.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{cartList.length} cart(s) returned from Huawei Cloud.</p>
                </div>
              ) : null}

              {!createResult && !fillResult && !cartListResult ? (
                <p className="text-sm text-slate-500">Run an action and its latest result will appear here.</p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="card">
            <p className="eyebrow">Price Check</p>
            <h2 className="mt-1 text-2xl font-semibold">Estimate ECS monthly price</h2>
            <p className="mt-2 text-sm text-slate-600">
              Uses the captured pricing request, but exposed as simple fields.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="price-region">
                  Region
                </label>
                <input className="field" id="price-region" onChange={(event) => setPriceRegion(event.target.value)} value={priceRegion} />
              </div>
              <div>
                <label className="label" htmlFor="price-spec">
                  Instance flavor
                </label>
                <input className="field" id="price-spec" onChange={(event) => setPriceSpec(event.target.value)} value={priceSpec} />
              </div>
              <div>
                <label className="label" htmlFor="price-disk-type">
                  System disk type
                </label>
                <input className="field" id="price-disk-type" onChange={(event) => setPriceDiskType(event.target.value)} value={priceDiskType} />
              </div>
              <div>
                <label className="label" htmlFor="price-disk-size">
                  Disk size (GB)
                </label>
                <input className="field" id="price-disk-size" onChange={(event) => setPriceDiskSize(event.target.value)} value={priceDiskSize} />
              </div>
              <div>
                <label className="label" htmlFor="price-hours">
                  Hours
                </label>
                <input className="field" id="price-hours" onChange={(event) => setPriceHours(event.target.value)} value={priceHours} />
              </div>
            </div>

            <button className="btn btn-primary mt-5" disabled={priceLoading || loadingTemplates} onClick={() => void estimatePrice()} type="button">
              {priceLoading ? "Estimating..." : "Estimate price"}
            </button>

            {priceResult ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="metric-card">
                  <p className="metric-label">Amount</p>
                  <p className="metric-value">{priceBody?.amount ?? "-"}</p>
                </div>
                <div className="metric-card">
                  <p className="metric-label">Currency</p>
                  <p className="metric-value">{priceBody?.currency ?? "-"}</p>
                </div>
                <div className="metric-card">
                  <p className="metric-label">Original</p>
                  <p className="metric-value">{priceBody?.originalAmount ?? "-"}</p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Catalog</p>
                <h2 className="mt-1 text-2xl font-semibold">Browse ECS flavors</h2>
              </div>
              <div className="flex items-end gap-3">
                <div>
                  <label className="label" htmlFor="catalog-region">
                    Region
                  </label>
                  <input className="field min-w-[180px]" id="catalog-region" onChange={(event) => setCatalogRegion(event.target.value)} value={catalogRegion} />
                </div>
                <button className="btn btn-primary" disabled={catalogLoading || loadingTemplates} onClick={() => void loadCatalog()} type="button">
                  {catalogLoading ? "Loading..." : "Load flavors"}
                </button>
              </div>
            </div>

            {catalogFlavors.length ? (
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {catalogFlavors.map((flavor) => (
                  <div key={flavor.resourceSpecCode} className="flavor-card">
                    <p className="font-semibold text-slate-900">{flavor.resourceSpecCode}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {flavor.productSpecDesc || flavor.productSpec || flavor.productSpecSysDesc || "No description"}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-5 text-sm text-slate-500">Load the product catalog to see available compute flavors for a region.</p>
            )}
          </div>
        </section>

        <section className="card">
          <p className="eyebrow">Debug</p>
          <h2 className="mt-1 text-2xl font-semibold">Raw response details</h2>
          <p className="mt-2 text-sm text-slate-600">
            Kept available for troubleshooting, but not the main workflow anymore.
          </p>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <details className="debug-panel">
              <summary>Create cart response</summary>
              <pre className="code-block mt-3">{createResult ? pretty(createResult.response.body) : "Run create cart first."}</pre>
            </details>
            <details className="debug-panel">
              <summary>Price response</summary>
              <pre className="code-block mt-3">{priceResult ? pretty(priceResult.response.body) : "Run price estimate first."}</pre>
            </details>
            <details className="debug-panel">
              <summary>Catalog response</summary>
              <pre className="code-block mt-3">{catalogResult ? pretty(catalogResult.response.body) : "Load flavors first."}</pre>
            </details>
            <details className="debug-panel">
              <summary>Cart list response</summary>
              <pre className="code-block mt-3">{cartListResult ? pretty(cartListResult.response.body) : "Refresh carts first."}</pre>
            </details>
          </div>
        </section>
      </main>
    </div>
  );
}
