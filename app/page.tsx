"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";

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

type CartDetailResult = {
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

type ShareCartItemPayload = {
  buyUrl?: string;
  rewriteValue?: {
    global_DESCRIPTION?: string;
  };
  selectedProduct?: {
    _customTitle?: string;
    description?: string;
    region?: string;
    amount?: number;
    originalAmount?: number;
    purchaseNum?: {
      measureValue?: number;
    };
    purchaseTime?: {
      measureValue?: number;
    };
    productAllInfos?: Array<Record<string, unknown>>;
  };
};

type ShareCartDetail = {
  billingMode?: string;
  cartListData?: ShareCartItemPayload[];
  name?: string;
  totalPrice?: {
    amount?: number;
    originalAmount?: number;
    discountAmount?: number;
  };
};

type RemoteCartItem = {
  id: string;
  title: string;
  description: string;
  region: string;
  quantity: number;
  hours: number;
  diskLabel: string;
  flavorCode: string;
  totalAmount: number;
  originalAmount: number;
};

type ProductFlavor = {
  resourceSpecCode: string;
  cloudServiceType?: string;
  resourceType?: string;
  productSpecSysDesc?: string;
  productSpec?: string;
  productSpecDesc?: string;
  resourceSpecType?: string;
  mem?: string;
  cpu?: string;
  instanceArch?: string;
  performType?: string;
  series?: string;
  image?: string;
  spec?: string;
  arch?: string;
  generation?: string;
  vmType?: string;
  productId?: string;
  billingMode?: string;
  siteCode?: string;
  periodNum?: number | null;
  billingEvent?: string;
  measureUnitStep?: number;
  measureUnit?: number;
  usageFactor?: string;
  usageMeasureId?: number;
  amount?: number;
  productNum?: number;
  inquiryTag?: string;
  selfProductNum?: number;
  transRate?: string;
  transTarget?: string;
  usageValue?: number;
  usageMeasureName?: string;
  usageMeasurePluralName?: string;
  selectIndex?: number;
  inquiryResult?: {
    id?: string;
    productId?: string;
    amount?: number;
    discountAmount?: number;
    originalAmount?: number;
    perAmount?: number | null;
    perDiscountAmount?: number | null;
    perOriginalAmount?: number | null;
    perPeriodType?: number | null;
    measureId?: number;
    extendParams?: unknown;
  };
  [key: string]: unknown;
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
  cartListData: Array<CalculatorCartItemPayload>;
  name: string;
  totalPrice: {
    amount: number;
    discountAmount: number;
    originalAmount: number;
  };
};

type PriceResponseBody = {
  amount: number;
  discountAmount: number;
  originalAmount: number;
  currency?: string;
  productRatingResult?: Array<{
    id?: string;
    productId?: string;
    amount?: number;
    discountAmount?: number;
    originalAmount?: number;
  }>;
};

type CalculatorCartItemPayload = {
  buyUrl?: string;
  rewriteValue?: Record<string, unknown>;
  selectedProduct?: Record<string, unknown>;
};

type CalculatorItem = {
  id: string;
  title: string;
  description: string;
  region: string;
  quantity: number;
  hours: number;
  diskType: string;
  diskSize: number;
  flavorCode: string;
  currency: string;
  totalAmount: number;
  originalAmount: number;
  payload: CalculatorCartItemPayload;
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

function getShareCartDetail(body: unknown): ShareCartDetail | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const data = (body as { data?: unknown }).data;
  if (!data || typeof data !== "object") {
    return null;
  }

  return data as ShareCartDetail;
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

function getFlavorLabel(flavor: ProductFlavor): string {
  const bits = [flavor.cpu, flavor.mem, flavor.performType].filter(Boolean);
  return bits.length ? bits.join(" / ") : flavor.resourceSpecCode;
}

function getFlavorCpuCount(flavor: ProductFlavor): number {
  const spec = flavor.productSpecSysDesc ?? "";
  const specMatch = spec.match(/vCPUs:(\d+)CORE/i);
  if (specMatch) {
    return Number.parseInt(specMatch[1], 10);
  }

  const cpuText = flavor.cpu ?? "";
  const cpuMatch = cpuText.match(/(\d+)/);
  return cpuMatch ? Number.parseInt(cpuMatch[1], 10) : 0;
}

function getFlavorMemoryGb(flavor: ProductFlavor): number {
  const spec = flavor.productSpecSysDesc ?? "";
  const mbMatch = spec.match(/Memory:(\d+)MB/i);
  if (mbMatch) {
    return Number.parseInt(mbMatch[1], 10) / 1024;
  }

  const memText = flavor.mem ?? "";
  const memMatch = memText.match(/(\d+(?:\.\d+)?)/);
  return memMatch ? Number.parseFloat(memMatch[1]) : 0;
}

function getFlavorPrice(flavor: ProductFlavor): number {
  if (typeof flavor.inquiryResult?.amount === "number") {
    return flavor.inquiryResult.amount;
  }

  if (typeof flavor.amount === "number") {
    return flavor.amount;
  }

  return Number.POSITIVE_INFINITY;
}

function getFlavorSpec(flavor: ProductFlavor): string {
  if (typeof flavor.spec === "string" && flavor.spec) {
    return flavor.spec;
  }

  return flavor.resourceSpecCode.replace(/\.linux$/, "");
}

function getSelectedFlavor(flavors: ProductFlavor[], code: string): ProductFlavor | null {
  return flavors.find((flavor) => flavor.resourceSpecCode === code) ?? null;
}

function getRemoteCartItems(detail: ShareCartDetail | null): RemoteCartItem[] {
  if (!detail?.cartListData?.length) {
    return [];
  }

  return detail.cartListData.map((item, index) => {
    const selectedProduct = item.selectedProduct ?? {};
    const productInfos = Array.isArray(selectedProduct.productAllInfos) ? selectedProduct.productAllInfos : [];
    const vmInfo = (productInfos[0] ?? {}) as Record<string, unknown>;
    const diskInfo = (productInfos[2] ?? {}) as Record<string, unknown>;
    const flavorCode = typeof vmInfo.resourceSpecCode === "string" ? vmInfo.resourceSpecCode : "Unknown flavor";
    const diskType = typeof diskInfo.resourceSpecCode === "string" ? diskInfo.resourceSpecCode : "Disk";
    const diskSize = typeof diskInfo.resourceSize === "number" ? diskInfo.resourceSize : 0;
    const title = selectedProduct._customTitle?.trim() || selectedProduct.description?.trim() || flavorCode || `Item ${index + 1}`;
    const descriptionParts = [
      typeof vmInfo.performType === "string" ? vmInfo.performType : null,
      typeof vmInfo.instanceArch === "string" ? vmInfo.instanceArch : null,
      typeof item.rewriteValue?.global_DESCRIPTION === "string" && item.rewriteValue.global_DESCRIPTION.trim()
        ? item.rewriteValue.global_DESCRIPTION.trim()
        : null,
    ].filter(Boolean);

    return {
      id: `${flavorCode}-${index}`,
      title,
      description: descriptionParts.join(" / ") || "Elastic Cloud Server",
      region: selectedProduct.region?.trim() || "Unknown region",
      quantity: selectedProduct.purchaseNum?.measureValue ?? (typeof vmInfo.productNum === "number" ? vmInfo.productNum : 1),
      hours: selectedProduct.purchaseTime?.measureValue ?? (typeof vmInfo.usageValue === "number" ? vmInfo.usageValue : 744),
      diskLabel: diskSize > 0 ? `${diskType} ${diskSize}GB` : diskType,
      flavorCode,
      totalAmount: selectedProduct.amount ?? 0,
      originalAmount: selectedProduct.originalAmount ?? selectedProduct.amount ?? 0,
    };
  });
}

function buildBuyUrl(
  baseUrl: string,
  region: string,
  flavor: ProductFlavor,
  diskType: string,
  diskSize: number,
  quantity: number,
): string {
  const url = new URL(baseUrl);
  url.searchParams.set("region", region);
  url.searchParams.set("flavor", getFlavorSpec(flavor));
  url.searchParams.set("sysdisk", `${diskType}:${diskSize}`);
  url.searchParams.set("vmcount", String(quantity));
  return url.toString();
}

function buildCalculatorItemPayload(
  sampleItem: CalculatorCartItemPayload,
  flavor: ProductFlavor,
  priceResponse: PriceResponseBody,
  config: {
    region: string;
    quantity: number;
    hours: number;
    diskType: string;
    diskSize: number;
    title: string;
    description: string;
  },
): CalculatorCartItemPayload {
  const payload = cloneJson(sampleItem);
  const selectedProduct = payload.selectedProduct as Record<string, unknown>;
  const rewriteValue = payload.rewriteValue as Record<string, unknown>;
  const productAllInfos = (selectedProduct.productAllInfos as Array<Record<string, unknown>>) ?? [];
  const vmInfo = productAllInfos[0] ?? {};
  const imageInfo = productAllInfos[1] ?? {};
  const diskInfo = productAllInfos[2] ?? {};
  const vmRating = priceResponse.productRatingResult?.[0];
  const diskRating = priceResponse.productRatingResult?.[1];

  payload.buyUrl = buildBuyUrl(payload.buyUrl ?? "", config.region, flavor, config.diskType, config.diskSize, config.quantity);

  rewriteValue.global_DESCRIPTION = config.description;
  rewriteValue.global_REGIONINFO = {
    region: config.region,
    locationType: "commonAZ",
    chargeMode: "ONDEMAND",
  };

  const templateRender = (rewriteValue.template_RENDER as Record<string, unknown>) ?? {};
  const radio = (templateRender.calculator_ecs_radio as Record<string, unknown>) ?? {};
  radio.arch = flavor.arch ?? radio.arch;
  radio.vmType = flavor.vmType ?? radio.vmType;
  radio.generation = flavor.generation ?? radio.generation;
  radio.cpu = flavor.cpu ?? radio.cpu;
  radio.mem = flavor.mem ?? radio.mem;
  templateRender.calculator_ecs_radio = radio;

  const evsStepper = (templateRender.calculator_evs_stepper as Record<string, unknown>) ?? {};
  const evsMain = (evsStepper.calculator_evs_stepper_main as Record<string, unknown>) ?? {};
  evsMain.type = config.diskType;
  evsMain.UNSET_Stepper_0 = {
    measureId: 17,
    measureValue: config.diskSize,
    measureNameBeforeTrans: "",
    measurePluralNameBeforeTrans: "",
    transRate: "",
    transTarget: "",
  };
  evsStepper.calculator_evs_stepper_main = evsMain;
  templateRender.calculator_evs_stepper = evsStepper;
  rewriteValue.template_RENDER = templateRender;

  rewriteValue.global_ONDEMANDTIME = {
    UNSET_Stepper_0: {
      measureId: 4,
      measureValue: config.hours,
      measureNameBeforeTrans: "",
      measurePluralNameBeforeTrans: "",
      transRate: "",
      transTarget: "",
    },
  };

  rewriteValue.global_QUANTITY = {
    UNSET_Stepper_0: {
      measureId: 41,
      measureValue: config.quantity,
      measureNameBeforeTrans: "calc_29_",
      measurePluralNameBeforeTrans: "calc_30_",
      transRate: "",
      transTarget: "",
    },
  };

  selectedProduct.region = config.region;
  selectedProduct.timeTag = Date.now();
  selectedProduct.description = config.description;
  selectedProduct._customTitle = config.title;
  selectedProduct.amount = priceResponse.amount;
  selectedProduct.discountAmount = priceResponse.discountAmount;
  selectedProduct.originalAmount = priceResponse.originalAmount;
  selectedProduct.purchaseTime = {
    measureValue: config.hours,
    measureId: 4,
    measureNameBeforeTrans: "",
    measurePluralNameBeforeTrans: "",
  };
  selectedProduct.purchaseNum = {
    measureValue: config.quantity,
    measureId: 41,
    measureNameBeforeTrans: "calc_29_",
    measurePluralNameBeforeTrans: "calc_30_",
  };

  productAllInfos[0] = {
    ...vmInfo,
    ...flavor,
    resourceType: flavor.resourceType ?? vmInfo.resourceType,
    cloudServiceType: flavor.cloudServiceType ?? vmInfo.cloudServiceType,
    resourceSpecCode: flavor.resourceSpecCode,
    productSpecSysDesc: flavor.productSpecSysDesc ?? vmInfo.productSpecSysDesc,
    productNum: config.quantity,
    selfProductNum: config.quantity,
    usageValue: config.hours,
    inquiryResult: {
      ...(vmInfo.inquiryResult as Record<string, unknown>),
      id: vmRating?.id ?? (vmInfo.inquiryResult as Record<string, unknown>)?.id,
      productId: vmRating?.productId ?? flavor.productId ?? vmInfo.productId,
      amount: vmRating?.amount ?? vmInfo.amount,
      discountAmount: vmRating?.discountAmount ?? 0,
      originalAmount: vmRating?.originalAmount ?? vmInfo.originalAmount ?? vmInfo.amount,
      perAmount: null,
      perDiscountAmount: null,
      perOriginalAmount: null,
      perPeriodType: null,
      measureId: 1,
      extendParams: null,
    },
  };

  productAllInfos[1] = {
    ...imageInfo,
    productNum: config.hours,
    durationNum: config.hours,
  };

  productAllInfos[2] = {
    ...diskInfo,
    resourceSpecCode: config.diskType,
    resourceSpecType: config.diskType,
    resourceSize: config.diskSize,
    productNum: config.quantity,
    selfProductNum: config.quantity,
    usageValue: config.hours,
    inquiryResult: {
      ...(diskInfo.inquiryResult as Record<string, unknown>),
      id: diskRating?.id ?? (diskInfo.inquiryResult as Record<string, unknown>)?.id,
      productId: diskRating?.productId ?? diskInfo.productId,
      amount: diskRating?.amount ?? diskInfo.amount,
      discountAmount: diskRating?.discountAmount ?? 0,
      originalAmount: diskRating?.originalAmount ?? diskInfo.originalAmount ?? diskInfo.amount,
      perAmount: null,
      perDiscountAmount: null,
      perOriginalAmount: null,
      perPeriodType: null,
      measureId: 1,
      extendParams: null,
    },
  };

  selectedProduct.productAllInfos = productAllInfos;
  payload.selectedProduct = selectedProduct;
  payload.rewriteValue = rewriteValue;

  return payload;
}

export default function Home() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [appError, setAppError] = useState("");

  const [cookie, setCookie] = useState("");
  const [csrf, setCsrf] = useState("");
  const [sessionOpen, setSessionOpen] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  const [carts, setCarts] = useState<CartSummary[]>([]);
  const [selectedCartKey, setSelectedCartKey] = useState("");
  const [selectedCartName, setSelectedCartName] = useState("");
  const [newCartName, setNewCartName] = useState("Team proposal cart");
  const [cartLoading, setCartLoading] = useState(false);
  const [createCartLoading, setCreateCartLoading] = useState(false);
  const [cartPage, setCartPage] = useState(1);
  const [cartDetailLoading, setCartDetailLoading] = useState(false);
  const [cartDetailError, setCartDetailError] = useState("");
  const [cartDetailResult, setCartDetailResult] = useState<CartDetailResult | null>(null);
  const [cartDetailCache, setCartDetailCache] = useState<Record<string, ShareCartDetail>>({});

  const [catalogRegion, setCatalogRegion] = useState("ap-southeast-3");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogMinVcpu, setCatalogMinVcpu] = useState("0");
  const [catalogMinRam, setCatalogMinRam] = useState("0");
  const [catalogSort, setCatalogSort] = useState("price-asc");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogResult, setCatalogResult] = useState<ReplayResult | null>(null);
  const [selectedFlavorCode, setSelectedFlavorCode] = useState("");
  const [flavorPage, setFlavorPage] = useState(1);

  const [configRegion, setConfigRegion] = useState("sa-brazil-1");
  const [configDiskType, setConfigDiskType] = useState("GPSSD");
  const [configDiskSize, setConfigDiskSize] = useState("40");
  const [configHours, setConfigHours] = useState("744");
  const [configQuantity, setConfigQuantity] = useState("1");
  const [configTitle, setConfigTitle] = useState("Elastic Cloud Server");
  const [configDescription, setConfigDescription] = useState("Generated from the custom calculator");

  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateResult, setEstimateResult] = useState<ReplayResult | null>(null);
  const [calculatorItems, setCalculatorItems] = useState<CalculatorItem[]>([]);
  const [publishLoading, setPublishLoading] = useState(false);
  const [publishResult, setPublishResult] = useState<ReplayResult | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);

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

        const priceBody = priceTemplate?.bodyJson as PricePayload | undefined;
        if (priceBody?.regionId) {
          setConfigRegion(priceBody.regionId);
          const vmProduct = priceBody.productInfos[0];
          const diskProduct = priceBody.productInfos[1];
          if (typeof diskProduct?.resourceSpecCode === "string") {
            setConfigDiskType(diskProduct.resourceSpecCode);
          }
          if (typeof diskProduct?.resourceSize === "number") {
            setConfigDiskSize(String(diskProduct.resourceSize));
          }
          if (typeof vmProduct?.usageValue === "number") {
            setConfigHours(String(vmProduct.usageValue));
          }
        }

        if (catalogTemplate) {
          const url = new URL(catalogTemplate.url);
          const region = url.searchParams.get("region");
          if (region) {
            setCatalogRegion(region);
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
  const flavors = getCatalogFlavors(catalogResult?.response.body);
  const deferredCatalogSearch = useDeferredValue(catalogSearch);
  const deferredSelectedCartKey = useDeferredValue(selectedCartKey);
  const cartsSorted = useMemo(() => {
    return [...carts].sort((left, right) => (right.updateTime ?? 0) - (left.updateTime ?? 0));
  }, [carts]);
  const filteredFlavors = useMemo(() => {
    return flavors
      .filter((flavor) => {
        if (!deferredCatalogSearch.trim()) {
          return true;
        }

        const haystack = `${flavor.resourceSpecCode} ${flavor.productSpecDesc ?? ""} ${flavor.productSpecSysDesc ?? ""} ${flavor.performType ?? ""}`.toLowerCase();
        return haystack.includes(deferredCatalogSearch.toLowerCase());
      })
      .filter((flavor) => getFlavorCpuCount(flavor) >= (Number.parseInt(catalogMinVcpu, 10) || 0))
      .filter((flavor) => getFlavorMemoryGb(flavor) >= (Number.parseInt(catalogMinRam, 10) || 0))
      .sort((left, right) => {
        const leftPrice = getFlavorPrice(left);
        const rightPrice = getFlavorPrice(right);
        return catalogSort === "price-desc" ? rightPrice - leftPrice : leftPrice - rightPrice;
      });
  }, [catalogMinRam, catalogMinVcpu, catalogSort, deferredCatalogSearch, flavors]);
  const selectedFlavor = getSelectedFlavor(flavors, selectedFlavorCode);
  const estimateBody = estimateResult?.response.body as PriceResponseBody | undefined;
  const stagedTotal = calculatorItems.reduce((sum, item) => sum + item.totalAmount, 0);
  const currentCartDetail = selectedCartKey ? cartDetailCache[selectedCartKey] ?? null : null;
  const remoteCartItems = useMemo(() => getRemoteCartItems(currentCartDetail), [currentCartDetail]);
  const remoteCartTotal = currentCartDetail?.totalPrice?.amount ?? remoteCartItems.reduce((sum, item) => sum + item.totalAmount, 0);
  const cartsPerPage = 6;
  const flavorsPerPage = 12;
  const totalCartPages = Math.max(1, Math.ceil(cartsSorted.length / cartsPerPage));
  const totalFlavorPages = Math.max(1, Math.ceil(filteredFlavors.length / flavorsPerPage));
  const paginatedCarts = cartsSorted.slice((cartPage - 1) * cartsPerPage, cartPage * cartsPerPage);
  const paginatedFlavors = filteredFlavors.slice((flavorPage - 1) * flavorsPerPage, flavorPage * flavorsPerPage);

  useEffect(() => {
    setCartPage(1);
  }, [carts.length]);

  useEffect(() => {
    setFlavorPage(1);
  }, [catalogSearch, catalogMinVcpu, catalogMinRam, catalogSort, catalogRegion, catalogResult]);

  useEffect(() => {
    if (cartPage > totalCartPages) {
      setCartPage(totalCartPages);
    }
  }, [cartPage, totalCartPages]);

  useEffect(() => {
    if (flavorPage > totalFlavorPages) {
      setFlavorPage(totalFlavorPages);
    }
  }, [flavorPage, totalFlavorPages]);

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

  const loadCartDetail = useCallback(async (key: string, force = false) => {
    const trimmedKey = key.trim();
    if (!trimmedKey) {
      return null;
    }

    if (!force && cartDetailCache[trimmedKey]) {
      return cartDetailCache[trimmedKey];
    }

    setCartDetailLoading(true);
    setCartDetailError("");

    try {
      const response = await fetch("/api/cart-detail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: trimmedKey,
          cookie: normalizedCookie || undefined,
          csrf: csrf.trim() || undefined,
        }),
      });

      const data = (await response.json()) as CartDetailResult & { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? `Cart detail lookup failed with status ${response.status}`);
      }

      const nextDetail = getShareCartDetail(data.response.body);
      if (!nextDetail) {
        throw new Error("Huawei cart detail did not return a usable payload");
      }

      setCartDetailResult(data);
      setCartDetailCache((current) => ({
        ...current,
        [trimmedKey]: nextDetail,
      }));

      if (!selectedCartName.trim() && nextDetail.name) {
        setSelectedCartName(nextDetail.name);
      }

      return nextDetail;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load selected cart";
      setCartDetailError(message);
      throw error;
    } finally {
      setCartDetailLoading(false);
    }
  }, [cartDetailCache, csrf, normalizedCookie, selectedCartName]);

  async function refreshCarts() {
    setCartLoading(true);
    setAppError("");

    try {
      const result = await replayOne("get-all-carts");
      const nextCarts = getCartList(result.response.body);
      setCarts(nextCarts);

      if (!selectedCartKey && nextCarts[0]) {
        setSelectedCartKey(nextCarts[0].key);
        setSelectedCartName(nextCarts[0].name);
      }
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "Failed to load carts");
    } finally {
      setCartLoading(false);
    }
  }

  useEffect(() => {
    if (deferredSelectedCartKey.trim().length < 12) {
      return;
    }

    void loadCartDetail(deferredSelectedCartKey, false);
  }, [deferredSelectedCartKey, loadCartDetail]);

  async function createCart() {
    const template = findTemplate(templates, "create-cart");
    if (!template || typeof template.bodyJson !== "object" || !template.bodyJson) {
      setAppError("Create cart template is missing");
      return;
    }

    setCreateCartLoading(true);
    setAppError("");

    try {
      const payload = cloneJson(template.bodyJson as Record<string, unknown>);
      payload.name = newCartName.trim() || "Team proposal cart";
      const result = await replayOne("create-cart", {
        bodyRaw: JSON.stringify(payload),
      });
      const key = (result.response.body as { data?: string }).data;
      await refreshCarts();

      if (typeof key === "string") {
        setSelectedCartKey(key);
        setSelectedCartName(payload.name as string);
        setCartDetailCache((current) => ({
          ...current,
          [key]: {
            name: payload.name as string,
            cartListData: [],
            totalPrice: {
              amount: 0,
              originalAmount: 0,
              discountAmount: 0,
            },
          },
        }));
      }
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "Failed to create cart");
    } finally {
      setCreateCartLoading(false);
    }
  }

  async function loadCatalog() {
    const template = findTemplate(templates, "get-product-options-and-info");
    if (!template) {
      setAppError("Catalog template is missing");
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

      const nextFlavors = getCatalogFlavors(result.response.body);
      if (nextFlavors[0]) {
        setSelectedFlavorCode(nextFlavors[0].resourceSpecCode);
        setConfigTitle(nextFlavors[0].resourceSpecCode);
      }
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "Failed to load catalog");
    } finally {
      setCatalogLoading(false);
    }
  }

  async function estimatePrice() {
    const template = findTemplate(templates, "get-price");
    if (!template || typeof template.bodyJson !== "object" || !template.bodyJson) {
      setAppError("Price template is missing");
      return;
    }

    if (!selectedFlavor) {
      setAppError("Select a flavor before estimating price");
      return;
    }

    setEstimateLoading(true);
    setAppError("");

    try {
      const payload = cloneJson(template.bodyJson as PricePayload);
      const quantity = Number.parseInt(configQuantity, 10) || 1;
      const hours = Number.parseInt(configHours, 10) || 744;
      const diskSize = Number.parseInt(configDiskSize, 10) || 40;

      payload.regionId = configRegion.trim() || payload.regionId;
      payload.productInfos[0].resourceSpecCode = selectedFlavor.resourceSpecCode;
      payload.productInfos[0].productNum = quantity;
      payload.productInfos[0].usageValue = hours;
      payload.productInfos[1].resourceSpecCode = configDiskType.trim() || payload.productInfos[1].resourceSpecCode;
      payload.productInfos[1].resourceSize = diskSize;
      payload.productInfos[1].productNum = quantity;
      payload.productInfos[1].usageValue = hours;

      const result = await replayOne("get-price", {
        bodyRaw: JSON.stringify(payload),
      });

      setEstimateResult(result);
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "Failed to estimate price");
    } finally {
      setEstimateLoading(false);
    }
  }

  function addEstimatedItem() {
    const editTemplate = findTemplate(templates, "edit-cart");
    if (!editTemplate || typeof editTemplate.bodyJson !== "object" || !editTemplate.bodyJson) {
      setAppError("Edit cart template is missing");
      return;
    }

    if (!selectedFlavor || !estimateBody) {
      setAppError("Estimate price before adding the item");
      return;
    }

    const sampleBody = editTemplate.bodyJson as EditCartPayload;
    const sampleItem = sampleBody.cartListData[0];
    const quantity = Number.parseInt(configQuantity, 10) || 1;
    const hours = Number.parseInt(configHours, 10) || 744;
    const diskSize = Number.parseInt(configDiskSize, 10) || 40;

    const payload = buildCalculatorItemPayload(sampleItem, selectedFlavor, estimateBody, {
      region: configRegion.trim() || "sa-brazil-1",
      quantity,
      hours,
      diskType: configDiskType.trim() || "GPSSD",
      diskSize,
      title: configTitle.trim() || selectedFlavor.resourceSpecCode,
      description: configDescription.trim() || "Generated from the custom calculator",
    });

    const item: CalculatorItem = {
      id: `${Date.now()}-${selectedFlavor.resourceSpecCode}`,
      title: configTitle.trim() || selectedFlavor.resourceSpecCode,
      description: configDescription.trim() || "Generated from the custom calculator",
      region: configRegion.trim() || "sa-brazil-1",
      quantity,
      hours,
      diskType: configDiskType.trim() || "GPSSD",
      diskSize,
      flavorCode: selectedFlavor.resourceSpecCode,
      currency: estimateBody.currency ?? "USD",
      totalAmount: estimateBody.amount,
      originalAmount: estimateBody.originalAmount,
      payload,
    };

    setCalculatorItems((current) => [...current, item]);
  }

  function removeItem(itemId: string) {
    setCalculatorItems((current) => current.filter((item) => item.id !== itemId));
  }

  async function publishCalculator() {
    const template = findTemplate(templates, "edit-cart");
    if (!template || typeof template.bodyJson !== "object" || !template.bodyJson) {
      setAppError("Edit cart template is missing");
      return;
    }

    if (!selectedCartKey.trim()) {
      setAppError("Select or create a Huawei cart first");
      return;
    }

    if (!calculatorItems.length) {
      setAppError("Add at least one product to the calculator before publishing");
      return;
    }

    setPublishLoading(true);
    setAppError("");

    try {
      const base = cloneJson(template.bodyJson as EditCartPayload);
      const total = calculatorItems.reduce((sum, item) => sum + item.totalAmount, 0);
      const original = calculatorItems.reduce((sum, item) => sum + item.originalAmount, 0);

      base.name = selectedCartName.trim() || "Calculator cart";
      base.cartListData = calculatorItems.map((item) => cloneJson(item.payload));
      base.totalPrice = {
        amount: Number(total.toFixed(5)),
        discountAmount: 0,
        originalAmount: Number(original.toFixed(5)),
      };

      const url = new URL(template.url);
      url.searchParams.set("key", selectedCartKey.trim());

      const result = await replayOne("edit-cart", {
        url: url.toString(),
        bodyRaw: JSON.stringify(base),
      });

      setPublishResult(result);
      await refreshCarts();
      await loadCartDetail(selectedCartKey.trim(), true);
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "Failed to publish calculator");
    } finally {
      setPublishLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f1df_0%,#f6fbf7_38%,#eef5ff_100%)] px-4 py-8 text-slate-900 sm:px-6 lg:px-10">
      <button className="session-toggle" onClick={() => setSessionOpen((open) => !open)} type="button">
        Session
      </button>

      {sessionOpen ? (
        <aside className="session-panel">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Shared Session</p>
              <h2 className="mt-1 text-xl font-semibold">One input for all Huawei cart calls</h2>
            </div>
            <button className="text-sm text-slate-500" onClick={() => setSessionOpen(false)} type="button">
              Close
            </button>
          </div>

          <label className="label mt-4" htmlFor="session-cookie">
            Cookie or HWS_INTL_ID
          </label>
          <textarea
            className="field h-28"
            id="session-cookie"
            onChange={(event) => setCookie(event.target.value)}
            placeholder="Paste the full cookie string, HWS_INTL_ID=..., or only the token."
            value={cookie}
          />

          <label className="label mt-3" htmlFor="session-csrf">
            CSRF
          </label>
          <input
            className="field"
            id="session-csrf"
            onChange={(event) => setCsrf(event.target.value)}
            placeholder="Optional"
            value={csrf}
          />

          <p className="mt-3 text-xs text-slate-500">
            The app reduces the cookie to the minimal form used by the cart APIs: <code>HWS_INTL_ID=...</code>.
          </p>

          {normalizedCookie ? (
            <div className="result-strip mt-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Sending</p>
              <p className="mt-1 break-all font-mono text-xs text-slate-700">{normalizedCookie}</p>
            </div>
          ) : null}
        </aside>
      ) : null}

      <main className="mx-auto max-w-[1500px] space-y-6">
        <section className="hero-card">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="eyebrow">Huawei Cloud Style Calculator</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
                Build an ECS proposal, price it, and publish it into a Huawei cart.
              </h1>
              <p className="mt-4 text-base leading-7 text-slate-600">
                Choose a target cart, browse flavors, configure compute and disk, estimate monthly cost, stage multiple
                products, and then write the calculator state into the selected share cart.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="metric-card">
                <p className="metric-label">Staged items</p>
                <p className="metric-value">{calculatorItems.length}</p>
              </div>
              <div className="metric-card">
                <p className="metric-label">Target cart</p>
                <p className="metric-value text-lg">{selectedCartName || "Unset"}</p>
              </div>
              <div className="metric-card">
                <p className="metric-label">Live cart total</p>
                <p className="metric-value">{remoteCartTotal.toFixed(2)}</p>
              </div>
            </div>
          </div>

          {appError ? (
            <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{appError}</p>
          ) : null}
        </section>

        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
            <div className="sidebar-card">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="eyebrow">Cart Sidebar</p>
                  <h2 className="mt-1 text-2xl font-semibold">Target cart</h2>
                </div>
                <button className="btn btn-secondary" disabled={cartLoading} onClick={() => void refreshCarts()} type="button">
                  {cartLoading ? "Refreshing..." : "Refresh"}
                </button>
              </div>

              <div className="soft-panel mt-4">
                <p className="section-title">Create a new cart</p>
                <label className="label mt-3" htmlFor="new-cart-name">
                  Cart name
                </label>
                <input className="field" id="new-cart-name" onChange={(event) => setNewCartName(event.target.value)} value={newCartName} />
                <button className="btn btn-primary mt-4 w-full" disabled={createCartLoading || loadingTemplates} onClick={() => void createCart()} type="button">
                  {createCartLoading ? "Creating..." : "Create cart"}
                </button>
              </div>

              <div className="soft-panel mt-4">
                <p className="section-title">Current selection</p>
                <label className="label mt-3" htmlFor="selected-cart-name">
                  Cart name
                </label>
                <input className="field" id="selected-cart-name" onChange={(event) => setSelectedCartName(event.target.value)} value={selectedCartName} />
                <label className="label mt-3" htmlFor="selected-cart-key">
                  Cart key
                </label>
                <input className="field" id="selected-cart-key" onChange={(event) => setSelectedCartKey(event.target.value)} value={selectedCartKey} />
              </div>

              <div className="mt-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="section-title">All carts</p>
                  <span className="pill">{cartsSorted.length}</span>
                </div>
                {cartsSorted.length ? (
                  <>
                    <div className="sidebar-list">
                      {paginatedCarts.map((cart) => (
                        <button
                          key={cart.key}
                          className={`cart-card ${selectedCartKey === cart.key ? "cart-card-active" : ""}`}
                          onClick={() => {
                            setSelectedCartKey(cart.key);
                            setSelectedCartName(cart.name || "");
                          }}
                          type="button"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-slate-900">{cart.name || "Untitled cart"}</p>
                              <p className="mt-1 text-xs text-slate-500">{formatDate(cart.updateTime)}</p>
                            </div>
                            <span className="pill">{(cart.totalPrice?.amount ?? 0).toFixed?.(2) ?? cart.totalPrice?.amount ?? 0}</span>
                          </div>
                          <p className="mt-3 break-all font-mono text-xs text-slate-600">{cart.key}</p>
                        </button>
                      ))}
                    </div>

                    <div className="pagination-bar mt-4">
                      <span className="text-sm text-slate-500">
                        Page {cartPage} of {totalCartPages}
                      </span>
                      <div className="flex items-center gap-2">
                        <button className="btn btn-secondary btn-small" disabled={cartPage <= 1} onClick={() => setCartPage((page) => page - 1)} type="button">
                          Previous
                        </button>
                        <button className="btn btn-secondary btn-small" disabled={cartPage >= totalCartPages} onClick={() => setCartPage((page) => page + 1)} type="button">
                          Next
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">
                    {normalizedCookie ? "Refresh carts to load your live Huawei cart list." : "Open Session and paste your HWS_INTL_ID to load carts."}
                  </p>
                )}
              </div>
            </div>

            <div className="sidebar-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">Current Cart</p>
                  <h2 className="mt-1 text-2xl font-semibold">Live contents</h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className="pill">{remoteCartItems.length} items</span>
                  <button className="btn btn-secondary btn-small" disabled={!selectedCartKey || cartDetailLoading} onClick={() => void loadCartDetail(selectedCartKey, true)} type="button">
                    {cartDetailLoading ? "Loading..." : "Refresh"}
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
                <div className="metric-card">
                  <p className="metric-label">Live total</p>
                  <p className="metric-value">{remoteCartTotal.toFixed(2)}</p>
                </div>
                <div className="metric-card">
                  <p className="metric-label">Cart key</p>
                  <p className="metric-value text-base break-all">{selectedCartKey || "Unset"}</p>
                </div>
              </div>

              {cartDetailError ? (
                <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{cartDetailError}</p>
              ) : null}

              <div className="mt-4 space-y-3">
                {remoteCartItems.length ? (
                  remoteCartItems.map((item) => (
                    <div key={item.id} className="result-strip">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">{item.title}</p>
                          <p className="mt-1 text-sm text-slate-600">{item.flavorCode}</p>
                        </div>
                        <span className="pill">{item.totalAmount.toFixed(2)}</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{item.description}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="pill">{item.region}</span>
                        <span className="pill">{item.quantity}x</span>
                        <span className="pill">{item.hours}h</span>
                        <span className="pill">{item.diskLabel}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">
                    {selectedCartKey ? "This share cart is empty or not loaded yet." : "Select a cart to load its live contents."}
                  </p>
                )}
              </div>
            </div>

            <div className="sidebar-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">Pending Publish</p>
                  <h2 className="mt-1 text-2xl font-semibold">Draft queue</h2>
                </div>
                <span className="pill">{calculatorItems.length} items</span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
                <div className="metric-card">
                  <p className="metric-label">Draft total</p>
                  <p className="metric-value">{stagedTotal.toFixed(2)}</p>
                </div>
                <div className="metric-card">
                  <p className="metric-label">Target name</p>
                  <p className="metric-value text-lg">{selectedCartName || "Unset"}</p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {calculatorItems.length ? (
                  calculatorItems.map((item) => (
                    <div key={item.id} className="result-strip">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">{item.title}</p>
                          <p className="mt-1 text-sm text-slate-600">{item.flavorCode}</p>
                        </div>
                        <button className="text-sm font-semibold text-slate-500" onClick={() => removeItem(item.id)} type="button">
                          Remove
                        </button>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="pill">{item.quantity}x</span>
                        <span className="pill">{item.hours}h</span>
                        <span className="pill">{item.diskType} {item.diskSize}GB</span>
                        <span className="pill">{item.totalAmount.toFixed(2)} {item.currency}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">The selected cart draft is empty. Add products from the flavor matrix.</p>
                )}
              </div>

              <button className="btn btn-primary mt-5 w-full" disabled={publishLoading || !calculatorItems.length || !selectedCartKey} onClick={() => void publishCalculator()} type="button">
                {publishLoading ? "Publishing..." : "Publish calculator to selected cart"}
              </button>

              {publishResult ? (
                <div className="result-strip mt-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">Latest publish</p>
                    <span className={`status ${publishResult.response.ok ? "status-ok" : "status-fail"}`}>
                      {publishResult.response.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    Draft published into <code>{selectedCartKey}</code>.
                  </p>
                </div>
              ) : null}
            </div>
          </aside>

          <section className="space-y-6">
            <div className="card calculator-shell">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="eyebrow">Step 2</p>
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

              <div className="mt-5 grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
                <div className="soft-panel">
                  <p className="section-title">Filter flavors</p>
                  <label className="label mt-3" htmlFor="catalog-search">
                    Search
                  </label>
                  <input
                    className="field"
                    id="catalog-search"
                    onChange={(event) => setCatalogSearch(event.target.value)}
                    placeholder="Flavor, workload, or spec"
                    value={catalogSearch}
                  />

                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    <div>
                      <label className="label" htmlFor="catalog-min-vcpu">
                        Min vCPU
                      </label>
                      <input
                        className="field"
                        id="catalog-min-vcpu"
                        onChange={(event) => setCatalogMinVcpu(event.target.value)}
                        value={catalogMinVcpu}
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor="catalog-min-ram">
                        Min RAM (GB)
                      </label>
                      <input
                        className="field"
                        id="catalog-min-ram"
                        onChange={(event) => setCatalogMinRam(event.target.value)}
                        value={catalogMinRam}
                      />
                    </div>
                  </div>

                  <label className="label mt-3" htmlFor="catalog-sort">
                    Sort by price
                  </label>
                  <select
                    className="field"
                    id="catalog-sort"
                    onChange={(event) => setCatalogSort(event.target.value)}
                    value={catalogSort}
                  >
                    <option value="price-asc">Lowest first</option>
                    <option value="price-desc">Highest first</option>
                  </select>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="pill">{filteredFlavors.length} shown</span>
                    <span className="pill">{flavors.length} total</span>
                    <span className="pill">Page {flavorPage} / {totalFlavorPages}</span>
                  </div>
                </div>

                <div className="soft-panel">
                  <div className="flavor-matrix-header">
                    <span>Flavor</span>
                    <span>vCPU</span>
                    <span>RAM</span>
                    <span>Type</span>
                    <span>Base price</span>
                  </div>

                  <div className="mt-2 space-y-2">
                    {paginatedFlavors.map((flavor) => (
                      <button
                        key={flavor.resourceSpecCode}
                        className={`flavor-row ${selectedFlavorCode === flavor.resourceSpecCode ? "flavor-row-active" : ""}`}
                        onClick={() => {
                          setSelectedFlavorCode(flavor.resourceSpecCode);
                          setConfigTitle(flavor.resourceSpecCode);
                          setEstimateResult(null);
                        }}
                        type="button"
                      >
                        <div>
                          <p className="font-semibold text-slate-900">{flavor.resourceSpecCode}</p>
                          <p className="mt-1 text-xs text-slate-500">{flavor.series ?? "ECS"} / {flavor.instanceArch ?? "x86"}</p>
                        </div>
                        <div className="text-sm text-slate-700">{getFlavorCpuCount(flavor)}</div>
                        <div className="text-sm text-slate-700">{getFlavorMemoryGb(flavor).toFixed(0)} GB</div>
                        <div className="text-sm text-slate-700">{flavor.performType ?? "General"}</div>
                        <div className="text-sm font-semibold text-slate-900">
                          {Number.isFinite(getFlavorPrice(flavor)) ? getFlavorPrice(flavor).toFixed(4) : "-"}
                        </div>
                      </button>
                    ))}
                  </div>

                  {filteredFlavors.length ? (
                    <div className="pagination-bar mt-4">
                      <span className="text-sm text-slate-500">
                        Showing {(flavorPage - 1) * flavorsPerPage + 1}-{Math.min(flavorPage * flavorsPerPage, filteredFlavors.length)} of {filteredFlavors.length}
                      </span>
                      <div className="flex items-center gap-2">
                        <button className="btn btn-secondary btn-small" disabled={flavorPage <= 1} onClick={() => setFlavorPage((page) => page - 1)} type="button">
                          Previous
                        </button>
                        <button className="btn btn-secondary btn-small" disabled={flavorPage >= totalFlavorPages} onClick={() => setFlavorPage((page) => page + 1)} type="button">
                          Next
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {!filteredFlavors.length ? (
                    <p className="mt-4 text-sm text-slate-500">
                      No flavors match the current filters. Lower the minimum vCPU or RAM threshold.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="card">
              <p className="eyebrow">Step 3</p>
              <h2 className="mt-1 text-2xl font-semibold">Configure and price the selected product</h2>

              <div className="mt-5 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
                <div className="soft-panel">
                  <p className="section-title">Configuration</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label" htmlFor="config-region">
                        Workload region
                      </label>
                      <input className="field" id="config-region" onChange={(event) => setConfigRegion(event.target.value)} value={configRegion} />
                    </div>
                    <div>
                      <label className="label" htmlFor="config-title">
                        Product title
                      </label>
                      <input className="field" id="config-title" onChange={(event) => setConfigTitle(event.target.value)} value={configTitle} />
                    </div>
                    <div>
                      <label className="label" htmlFor="config-hours">
                        Hours
                      </label>
                      <input className="field" id="config-hours" onChange={(event) => setConfigHours(event.target.value)} value={configHours} />
                    </div>
                    <div>
                      <label className="label" htmlFor="config-quantity">
                        Quantity
                      </label>
                      <input className="field" id="config-quantity" onChange={(event) => setConfigQuantity(event.target.value)} value={configQuantity} />
                    </div>
                    <div>
                      <label className="label" htmlFor="config-disk-type">
                        Disk type
                      </label>
                      <input className="field" id="config-disk-type" onChange={(event) => setConfigDiskType(event.target.value)} value={configDiskType} />
                    </div>
                    <div>
                      <label className="label" htmlFor="config-disk-size">
                        Disk size (GB)
                      </label>
                      <input className="field" id="config-disk-size" onChange={(event) => setConfigDiskSize(event.target.value)} value={configDiskSize} />
                    </div>
                  </div>

                  <label className="label mt-3" htmlFor="config-description">
                    Description
                  </label>
                  <textarea className="field h-24" id="config-description" onChange={(event) => setConfigDescription(event.target.value)} value={configDescription} />
                </div>

                <div className="soft-panel">
                  <p className="section-title">Selected flavor</p>
                  {selectedFlavor ? (
                    <>
                      <p className="mt-3 text-2xl font-semibold text-slate-900">{selectedFlavor.resourceSpecCode}</p>
                      <p className="mt-1 text-sm text-slate-600">{getFlavorLabel(selectedFlavor)}</p>
                      <p className="mt-4 text-sm leading-6 text-slate-600">
                        {selectedFlavor.productSpecDesc || selectedFlavor.productSpecSysDesc || "No description available"}
                      </p>
                    </>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">Load the catalog and choose a flavor first.</p>
                  )}

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button className="btn btn-primary" disabled={estimateLoading || loadingTemplates || !selectedFlavor} onClick={() => void estimatePrice()} type="button">
                      {estimateLoading ? "Estimating..." : "Estimate ECS monthly price"}
                    </button>
                    <button className="btn btn-secondary" disabled={!estimateBody} onClick={addEstimatedItem} type="button">
                      Add product to calculator
                    </button>
                  </div>

                  {estimateBody ? (
                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                      <div className="metric-card">
                        <p className="metric-label">Estimated total</p>
                        <p className="metric-value">{estimateBody.amount.toFixed(2)}</p>
                      </div>
                      <div className="metric-card">
                        <p className="metric-label">Currency</p>
                        <p className="metric-value text-lg">{estimateBody.currency ?? "USD"}</p>
                      </div>
                      <div className="metric-card">
                        <p className="metric-label">Line items</p>
                        <p className="metric-value">{estimateBody.productRatingResult?.length ?? 0}</p>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        </div>

        <section className="card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Diagnostics</p>
              <h2 className="mt-1 text-2xl font-semibold">Developer panel</h2>
            </div>
            <button className="btn btn-secondary" onClick={() => setDebugOpen((open) => !open)} type="button">
              {debugOpen ? "Hide debug" : "Show debug"}
            </button>
          </div>

          {debugOpen ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <details className="debug-panel">
                <summary>Catalog response</summary>
                <pre className="code-block mt-3">{catalogResult ? pretty(catalogResult.response.body) : "Load flavors first."}</pre>
              </details>
              <details className="debug-panel">
                <summary>Price response</summary>
                <pre className="code-block mt-3">{estimateResult ? pretty(estimateResult.response.body) : "Estimate first."}</pre>
              </details>
              <details className="debug-panel">
                <summary>Publish response</summary>
                <pre className="code-block mt-3">{publishResult ? pretty(publishResult.response.body) : "Publish the calculator first."}</pre>
              </details>
              <details className="debug-panel">
                <summary>Selected cart detail</summary>
                <pre className="code-block mt-3">{cartDetailResult ? pretty(cartDetailResult.response.body) : "Select a cart to load its live contents."}</pre>
              </details>
              <details className="debug-panel">
                <summary>Current calculator payload</summary>
                <pre className="code-block mt-3">{calculatorItems.length ? pretty(calculatorItems.map((item) => item.payload)) : "Add items to the calculator first."}</pre>
              </details>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">Hidden by default to keep the calculator faster and cleaner.</p>
          )}
        </section>
      </main>
    </div>
  );
}
