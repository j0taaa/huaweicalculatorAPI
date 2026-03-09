"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  buildCatalogPriceEstimate,
  getEffectiveDiskPricingMode,
  getCatalogDisks,
  getCatalogFlavors,
  getFlavorBasePrice,
  type CatalogPricingMode,
  type PriceResponseBody,
  type ProductDisk,
  type ProductFlavor,
} from "@/lib/catalog";

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
  authExpired?: boolean;
  authCode?: string;
  authMessage?: string;
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
  authExpired?: boolean;
  authCode?: string;
  authMessage?: string;
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

type CatalogRegion = {
  id: string;
  name: string;
};

type CatalogCacheMeta = {
  refreshIntervalMs?: number;
  warming?: boolean;
  lastRefreshStartedAt?: string | null;
  lastRefreshCompletedAt?: string | null;
  cachedRegionCount?: number;
  source?: string;
  region?: string;
};

type CatalogCacheResult = ReplayResult & {
  cache?: CatalogCacheMeta;
  regions?: CatalogRegion[];
  regionErrors?: Record<string, string>;
  error?: string;
};

type CatalogRegionListResult = {
  cache?: CatalogCacheMeta;
  regions?: CatalogRegion[];
  regionErrors?: Record<string, string>;
  error?: string;
};

type ShareCartItemPayload = {
  buyUrl?: string;
  rewriteValue?: {
    global_DESCRIPTION?: string;
    global_PRICINGMODE?: string;
    global_DISKPRICINGMODE?: string;
    global_DURATIONUNIT?: string;
    global_REGIONINFO?: {
      chargeMode?: string;
    };
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
    chargeMode?: string;
    chargeModeName?: string;
    calculatorPricingMode?: string;
    calculatorDiskPricingMode?: string;
    calculatorDurationUnit?: string;
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
  index: number;
  title: string;
  description: string;
  region: string;
  quantity: number;
  hours: number;
  pricingMode: CatalogPricingMode;
  diskPricingMode: CatalogPricingMode;
  durationUnit: string;
  diskType: string;
  diskSize: number;
  diskLabel: string;
  flavorCode: string;
  totalAmount: number;
  originalAmount: number;
  payload: CalculatorCartItemPayload;
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
  pricingMode: CatalogPricingMode;
  diskPricingMode: CatalogPricingMode;
  durationUnit: string;
  diskType: string;
  diskSize: number;
  flavorCode: string;
  currency: string;
  totalAmount: number;
  originalAmount: number;
  payload: CalculatorCartItemPayload;
};

type EditorTarget =
  | {
      kind: "draft";
      id: string;
    }
  | {
      kind: "remote";
      id: string;
    };

const CONFIG_HOUR_OPTIONS = ["24", "168", "360", "720", "744"];
const CONFIG_MONTH_OPTIONS = ["1", "3", "6", "12", "24", "36"];
const CONFIG_YEAR_OPTIONS = ["1", "2", "3"];
const CONFIG_QUANTITY_OPTIONS = ["1", "2", "3", "5", "10"];
const DEFAULT_REGION = "sa-brazil-1";
const DEFAULT_CATALOG_DISK_TYPE = "GPSSD";
const DEFAULT_PRICING_MODE: CatalogPricingMode = "ONDEMAND";
const PRICING_MODE_OPTIONS: Array<{ value: CatalogPricingMode; label: string }> = [
  { value: "ONDEMAND", label: "On-demand" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "YEARLY", label: "Yearly" },
  { value: "RI", label: "RI" },
];

function isCatalogPricingMode(value: string): value is CatalogPricingMode {
  return PRICING_MODE_OPTIONS.some((option) => option.value === value);
}

function getPricingModeLabel(pricingMode: CatalogPricingMode): string {
  return PRICING_MODE_OPTIONS.find((option) => option.value === pricingMode)?.label ?? pricingMode;
}

function getPricingRateLabel(pricingMode: CatalogPricingMode): string {
  switch (pricingMode) {
    case "MONTHLY":
      return "Base monthly price";
    case "YEARLY":
      return "Base yearly price";
    case "RI":
      return "RI price";
    default:
      return "Base hourly price";
  }
}

function getPricingDurationLabel(pricingMode: CatalogPricingMode): string {
  switch (pricingMode) {
    case "MONTHLY":
      return "Months";
    case "YEARLY":
      return "Years";
    case "RI":
      return "Reservations";
    default:
      return "Hours";
  }
}

function getPricingDurationUnit(pricingMode: CatalogPricingMode): string {
  switch (pricingMode) {
    case "MONTHLY":
      return "month";
    case "YEARLY":
      return "year";
    case "RI":
      return "reservation";
    default:
      return "hour";
  }
}

function getPricingDurationOptions(pricingMode: CatalogPricingMode): string[] {
  switch (pricingMode) {
    case "MONTHLY":
      return CONFIG_MONTH_OPTIONS;
    case "YEARLY":
      return CONFIG_YEAR_OPTIONS;
    case "RI":
      return ["1"];
    default:
      return CONFIG_HOUR_OPTIONS;
  }
}

function getDefaultDurationValue(pricingMode: CatalogPricingMode): string {
  return getPricingDurationOptions(pricingMode)[0] ?? "1";
}

function formatDuration(pricingMode: CatalogPricingMode, value: number): string {
  const unit = getPricingDurationUnit(pricingMode);
  const suffix = value === 1 ? unit : `${unit}s`;
  return `${value} ${suffix}`;
}

function getNormalizedDurationValue(pricingMode: CatalogPricingMode, value: string): number {
  const parsed = Number.parseInt(value, 10) || Number.parseInt(getDefaultDurationValue(pricingMode), 10) || 1;
  return pricingMode === "RI" ? 1 : parsed;
}

function getStoredPricingMode(item: ShareCartItemPayload): CatalogPricingMode {
  const selectedProduct = item.selectedProduct ?? {};
  const rewriteValue = item.rewriteValue ?? {};
  const candidate = (
    selectedProduct.calculatorPricingMode
    ?? selectedProduct.chargeMode
    ?? rewriteValue.global_PRICINGMODE
    ?? rewriteValue.global_REGIONINFO?.chargeMode
    ?? ""
  ).trim();

  return isCatalogPricingMode(candidate) ? candidate : DEFAULT_PRICING_MODE;
}

function withCurrentOption(options: string[], current: string): string[] {
  const trimmed = current.trim();
  if (!trimmed || options.includes(trimmed)) {
    return options;
  }

  return [trimmed, ...options];
}

function mergeCatalogRegions(regions: CatalogRegion[], ...extraRegionIds: string[]): CatalogRegion[] {
  const merged = new Map<string, CatalogRegion>();

  for (const regionId of [DEFAULT_REGION, ...extraRegionIds]) {
    const trimmed = regionId.trim();
    if (trimmed && !merged.has(trimmed)) {
      merged.set(trimmed, { id: trimmed, name: trimmed });
    }
  }

  for (const region of regions) {
    const id = region.id.trim();
    if (!id || merged.has(id)) {
      continue;
    }

    merged.set(id, {
      id,
      name: region.name.trim() || id,
    });
  }

  return [...merged.values()];
}

function buildCachedEstimateResult(
  body: PriceResponseBody,
  region: string,
  flavorCode: string,
  diskType: string,
  diskSize: number,
  durationValue: number,
  quantity: number,
  pricingMode: CatalogPricingMode,
): ReplayResult {
  return {
    endpoint: {
      id: "cached-price-estimate",
      name: "Cached price estimate",
    },
    request: {
      method: "POST",
      url: `/api/catalog?region=${encodeURIComponent(region)}`,
      headers: {},
      bodyRaw: JSON.stringify({
        region,
        flavorCode,
        diskType,
        diskSize,
        durationValue,
        quantity,
        pricingMode,
      }),
      useCapturedAuth: false,
    },
    response: {
      ok: true,
      status: 200,
      statusText: "OK",
      contentType: "application/json",
      durationMs: 0,
      body,
      rawTextPreview: JSON.stringify(body).slice(0, 1200),
    },
    testedAt: new Date().toISOString(),
  };
}

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

function getFlavorSpec(flavor: ProductFlavor): string {
  if (typeof flavor.spec === "string" && flavor.spec) {
    return flavor.spec;
  }

  return flavor.resourceSpecCode.replace(/\.linux$/, "");
}

function getDiskTypeLabel(disk: ProductDisk): string {
  const description = typeof disk.productSpecDesc === "string" ? disk.productSpecDesc.trim() : "";
  return description ? `${disk.resourceSpecCode} · ${description}` : disk.resourceSpecCode;
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
    const pricingMode = getStoredPricingMode(item);
    const durationUnit = selectedProduct.calculatorDurationUnit?.trim() || getPricingDurationUnit(pricingMode);
    const storedDiskPricingMode = selectedProduct.calculatorDiskPricingMode?.trim() ?? "";
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
      index,
      title,
      description: descriptionParts.join(" / ") || "Elastic Cloud Server",
      region: selectedProduct.region?.trim() || "Unknown region",
      quantity: selectedProduct.purchaseNum?.measureValue ?? (typeof vmInfo.productNum === "number" ? vmInfo.productNum : 1),
      hours: selectedProduct.purchaseTime?.measureValue ?? (typeof vmInfo.usageValue === "number" ? vmInfo.usageValue : 744),
      pricingMode,
      diskPricingMode: isCatalogPricingMode(storedDiskPricingMode)
        ? storedDiskPricingMode
        : getEffectiveDiskPricingMode(pricingMode),
      durationUnit,
      diskType,
      diskSize,
      diskLabel: diskSize > 0 ? `${diskType} ${diskSize}GB` : diskType,
      flavorCode,
      totalAmount: selectedProduct.amount ?? 0,
      originalAmount: selectedProduct.originalAmount ?? selectedProduct.amount ?? 0,
      payload: cloneJson(item as CalculatorCartItemPayload),
    };
  });
}

function getPayloadAmount(item: CalculatorCartItemPayload): number {
  const selectedProduct = item.selectedProduct as { amount?: unknown } | undefined;
  return typeof selectedProduct?.amount === "number" ? selectedProduct.amount : 0;
}

function getPayloadOriginalAmount(item: CalculatorCartItemPayload): number {
  const selectedProduct = item.selectedProduct as { originalAmount?: unknown; amount?: unknown } | undefined;
  if (typeof selectedProduct?.originalAmount === "number") {
    return selectedProduct.originalAmount;
  }

  return typeof selectedProduct?.amount === "number" ? selectedProduct.amount : 0;
}

function buildCartTotalPrice(items: CalculatorCartItemPayload[]) {
  const amount = items.reduce((sum, item) => sum + getPayloadAmount(item), 0);
  const originalAmount = items.reduce((sum, item) => sum + getPayloadOriginalAmount(item), 0);

  return {
    amount: Number(amount.toFixed(5)),
    discountAmount: 0,
    originalAmount: Number(originalAmount.toFixed(5)),
  };
}

function PencilIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path
        d="M4 20h4l10-10-4-4L4 16v4Zm3.5-2.5H6.5v-1l8.56-8.56 1 1L7.5 17.5ZM16.06 7.94l-1-1 1.22-1.22a1 1 0 0 1 1.41 0l.59.59a1 1 0 0 1 0 1.41l-1.22 1.22Z"
        fill="currentColor"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path
        d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 6h2v8h-2V9Zm4 0h2v8h-2V9ZM7 9h2v8H7V9Zm1 11a2 2 0 0 1-2-2V8h12v10a2 2 0 0 1-2 2H8Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg aria-hidden="true" className="icon-spin" fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="12" opacity="0.2" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function buildCartMutationUrl(template: Template, action: "update" | "delete", key: string): string {
  const nextUrl = action === "update"
    ? template.url
    : template.url.replace("/share/update", "/share/delete");

  if (!nextUrl.includes(`/share/${action}`)) {
    throw new Error(`The ${action} cart endpoint could not be derived from the edit cart template`);
  }

  const url = new URL(nextUrl);
  url.searchParams.set("key", key.trim());
  return url.toString();
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
    durationValue: number;
    pricingMode: CatalogPricingMode;
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
  const diskPricingMode = getEffectiveDiskPricingMode(config.pricingMode);
  const durationUnit = getPricingDurationUnit(config.pricingMode);

  payload.buyUrl = buildBuyUrl(payload.buyUrl ?? "", config.region, flavor, config.diskType, config.diskSize, config.quantity);

  rewriteValue.global_DESCRIPTION = config.description;
  rewriteValue.global_PRICINGMODE = config.pricingMode;
  rewriteValue.global_DISKPRICINGMODE = diskPricingMode;
  rewriteValue.global_DURATIONUNIT = durationUnit;
  rewriteValue.global_REGIONINFO = {
    region: config.region,
    locationType: "commonAZ",
    chargeMode: config.pricingMode,
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
      measureValue: config.durationValue,
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
  selectedProduct.chargeMode = config.pricingMode;
  selectedProduct.chargeModeName = config.pricingMode;
  selectedProduct.calculatorPricingMode = config.pricingMode;
  selectedProduct.calculatorDiskPricingMode = diskPricingMode;
  selectedProduct.calculatorDurationUnit = durationUnit;
  selectedProduct.amount = priceResponse.amount;
  selectedProduct.discountAmount = priceResponse.discountAmount;
  selectedProduct.originalAmount = priceResponse.originalAmount;
  selectedProduct.purchaseTime = {
    measureValue: config.durationValue,
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
    billingMode: config.pricingMode,
    usageValue: config.durationValue,
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
    productNum: config.durationValue,
    durationNum: config.durationValue,
  };

  productAllInfos[2] = {
    ...diskInfo,
    resourceSpecCode: config.diskType,
    resourceSpecType: config.diskType,
    resourceSize: config.diskSize,
    productNum: config.quantity,
    selfProductNum: config.quantity,
    billingMode: diskPricingMode,
    usageValue: config.durationValue,
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
  const [cartAction, setCartAction] = useState<"rename" | "delete" | null>(null);
  const [cartPage, setCartPage] = useState(1);
  const [cartDetailLoading, setCartDetailLoading] = useState(false);
  const [cartDetailError, setCartDetailError] = useState("");
  const [cartDetailResult, setCartDetailResult] = useState<CartDetailResult | null>(null);
  const [cartDetailCache, setCartDetailCache] = useState<Record<string, ShareCartDetail>>({});

  const [catalogRegion, setCatalogRegion] = useState(DEFAULT_REGION);
  const [catalogRegions, setCatalogRegions] = useState<CatalogRegion[]>([
    { id: DEFAULT_REGION, name: DEFAULT_REGION },
  ]);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogMinVcpu, setCatalogMinVcpu] = useState("0");
  const [catalogMinRam, setCatalogMinRam] = useState("0");
  const [catalogSort, setCatalogSort] = useState("price-asc");
  const [catalogPricingMode, setCatalogPricingMode] = useState<CatalogPricingMode>(DEFAULT_PRICING_MODE);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogResult, setCatalogResult] = useState<CatalogCacheResult | null>(null);
  const [selectedFlavorCode, setSelectedFlavorCode] = useState("");
  const [flavorPage, setFlavorPage] = useState(1);

  const [configDiskType, setConfigDiskType] = useState(DEFAULT_CATALOG_DISK_TYPE);
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
  const [editorTarget, setEditorTarget] = useState<EditorTarget | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [templateResponse, regionResponse] = await Promise.all([
          fetch("/api/templates", { cache: "no-store" }),
          fetch("/api/catalog", { cache: "no-store" }),
        ]);
        if (!templateResponse.ok) {
          throw new Error(`Failed to load templates: ${templateResponse.status}`);
        }

        const data = (await templateResponse.json()) as { templates: Template[] };
        setTemplates(data.templates);

        if (regionResponse.ok) {
          const regionData = (await regionResponse.json()) as CatalogRegionListResult;
          setCatalogRegions((current) => mergeCatalogRegions(regionData.regions ?? current, DEFAULT_REGION));
        }

        const priceTemplate = findTemplate(data.templates, "get-price");
        const catalogTemplate = findTemplate(data.templates, "get-product-options-and-info");

        const priceBody = priceTemplate?.bodyJson as PricePayload | undefined;
        if (priceBody) {
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
            setCatalogRegions((current) => mergeCatalogRegions(current, region));
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
  const catalogDisks = getCatalogDisks(catalogResult?.response.body);
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
        const leftPrice = getFlavorBasePrice(left, catalogPricingMode);
        const rightPrice = getFlavorBasePrice(right, catalogPricingMode);
        return catalogSort === "price-desc" ? rightPrice - leftPrice : leftPrice - rightPrice;
      });
  }, [catalogMinRam, catalogMinVcpu, catalogPricingMode, catalogSort, deferredCatalogSearch, flavors]);
  const selectedFlavor = getSelectedFlavor(flavors, selectedFlavorCode);
  const selectedFlavorPrice = selectedFlavor ? getFlavorBasePrice(selectedFlavor, catalogPricingMode) : Number.POSITIVE_INFINITY;
  const selectedFlavorSupportsPricingMode = Number.isFinite(selectedFlavorPrice);
  const estimateBody = estimateResult?.response.body as PriceResponseBody | undefined;
  const stagedTotal = calculatorItems.reduce((sum, item) => sum + item.totalAmount, 0);
  const currentCartDetail = selectedCartKey ? cartDetailCache[selectedCartKey] ?? null : null;
  const remoteCartItems = useMemo(() => getRemoteCartItems(currentCartDetail), [currentCartDetail]);
  const remoteCartTotal = currentCartDetail?.totalPrice?.amount ?? remoteCartItems.reduce((sum, item) => sum + item.totalAmount, 0);
  const editingDraftItem = editorTarget?.kind === "draft" ? calculatorItems.find((item) => item.id === editorTarget.id) ?? null : null;
  const editingRemoteItem = editorTarget?.kind === "remote" ? remoteCartItems.find((item) => item.id === editorTarget.id) ?? null : null;
  const cartsPerPage = 6;
  const flavorsPerPage = 12;
  const totalCartPages = Math.max(1, Math.ceil(cartsSorted.length / cartsPerPage));
  const totalFlavorPages = Math.max(1, Math.ceil(filteredFlavors.length / flavorsPerPage));
  const paginatedCarts = cartsSorted.slice((cartPage - 1) * cartsPerPage, cartPage * cartsPerPage);
  const paginatedFlavors = filteredFlavors.slice((flavorPage - 1) * flavorsPerPage, flavorPage * flavorsPerPage);
  const catalogRegionOptions = useMemo(() => mergeCatalogRegions(catalogRegions, catalogRegion), [catalogRegion, catalogRegions]);
  const configDiskTypeOptions = useMemo(() => {
    return withCurrentOption(
      [...new Set(catalogDisks.map((disk) => disk.resourceSpecCode.trim()).filter(Boolean))],
      configDiskType,
    );
  }, [catalogDisks, configDiskType]);
  const configHourOptions = withCurrentOption(getPricingDurationOptions(catalogPricingMode), configHours);
  const configQuantityOptions = withCurrentOption(CONFIG_QUANTITY_OPTIONS, configQuantity);

  useEffect(() => {
    setConfigHours((current) => (
      getPricingDurationOptions(catalogPricingMode).includes(current)
        ? current
        : getDefaultDurationValue(catalogPricingMode)
    ));
    setEstimateResult(null);
  }, [catalogPricingMode]);

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

    const data = (await response.json()) as ReplayResult & { error?: string; authExpired?: boolean };
    if (!response.ok) {
      if (response.status === 401 && data.authExpired) {
        throw new Error(data.error ?? "Huawei session expired. Open Session and paste a fresh cookie or HWS_INTL_ID.");
      }
      throw new Error(data.error ?? `Replay failed with status ${response.status}`);
    }

    return data;
  }

  async function fetchCatalogFromCache(region: string): Promise<CatalogCacheResult> {
    const response = await fetch(`/api/catalog?region=${encodeURIComponent(region)}`, {
      cache: "no-store",
    });

    const data = (await response.json()) as CatalogCacheResult;
    if (!response.ok) {
      throw new Error(data.error ?? `Catalog cache lookup failed with status ${response.status}`);
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

      const data = (await response.json()) as CartDetailResult & { error?: string; authExpired?: boolean };
      if (!response.ok) {
        if (response.status === 401 && data.authExpired) {
          throw new Error(data.error ?? "Huawei session expired. Open Session and paste a fresh cookie or HWS_INTL_ID.");
        }
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

  useEffect(() => {
    setEditorTarget((current) => {
      if (!current) {
        return null;
      }

      if (current.kind === "remote" && !remoteCartItems.some((item) => item.id === current.id)) {
        return null;
      }

      if (current.kind === "draft" && !calculatorItems.some((item) => item.id === current.id)) {
        return null;
      }

      return current;
    });
  }, [calculatorItems, remoteCartItems]);

  async function loadCatalogForRegion(region: string, preferredFlavorCode?: string) {
    setCatalogLoading(true);
    setAppError("");

    try {
      const nextRegion = region.trim() || DEFAULT_REGION;
      setCatalogRegion(nextRegion);
      const result = await fetchCatalogFromCache(nextRegion);
      setCatalogResult(result);
      setCatalogRegions((current) => mergeCatalogRegions(result.regions ?? current, nextRegion));

      const nextFlavors = getCatalogFlavors(result.response.body);
      const preferred = preferredFlavorCode
        ? nextFlavors.find((flavor) => flavor.resourceSpecCode === preferredFlavorCode)
        : nextFlavors[0];

      if (preferred) {
        setSelectedFlavorCode(preferred.resourceSpecCode);
        setConfigTitle((current) => current || preferred.resourceSpecCode);
      }

      return nextFlavors;
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "Failed to load catalog");
      return [] as ProductFlavor[];
    } finally {
      setCatalogLoading(false);
    }
  }

  function populateEditorFromDraftItem(item: CalculatorItem) {
    setEditorTarget({ kind: "draft", id: item.id });
    setCatalogPricingMode(item.pricingMode);
    setConfigQuantity(String(item.quantity));
    setConfigHours(String(item.hours));
    setConfigDiskType(item.diskType);
    setConfigDiskSize(String(item.diskSize));
    setConfigTitle(item.title);
    setConfigDescription(item.description);
    setSelectedFlavorCode(item.flavorCode);
    setEstimateResult(null);
    void loadCatalogForRegion(item.region, item.flavorCode);
  }

  function populateEditorFromRemoteItem(item: RemoteCartItem) {
    setEditorTarget({ kind: "remote", id: item.id });
    setCatalogPricingMode(item.pricingMode);
    setConfigQuantity(String(item.quantity));
    setConfigHours(String(item.hours));
    setConfigDiskType(item.diskType);
    setConfigDiskSize(String(item.diskSize));
    setConfigTitle(item.title);
    setConfigDescription(item.description);
    setSelectedFlavorCode(item.flavorCode);
    setEstimateResult(null);
    void loadCatalogForRegion(item.region, item.flavorCode);
  }

  function cancelEditor() {
    setEditorTarget(null);
  }

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
    await loadCatalogForRegion(catalogRegion);
  }

  async function estimatePrice() {
    if (!selectedFlavor) {
      setAppError("Select a flavor before estimating price");
      return;
    }

    if (!selectedFlavorSupportsPricingMode) {
      setAppError(`${selectedFlavor.resourceSpecCode} does not expose ${getPricingModeLabel(catalogPricingMode)} pricing in the cached Huawei catalog`);
      return;
    }

    setEstimateLoading(true);
    setAppError("");

    try {
      const quantity = Number.parseInt(configQuantity, 10) || 1;
      const durationValue = getNormalizedDurationValue(catalogPricingMode, configHours);
      const diskSize = Number.parseInt(configDiskSize, 10) || 40;
      const nextRegion = catalogRegion.trim() || DEFAULT_REGION;
      const pricingCatalog = nextRegion === catalogRegion.trim() && catalogResult
        ? catalogResult
        : await fetchCatalogFromCache(nextRegion);
      const estimate = buildCatalogPriceEstimate(pricingCatalog.response.body, {
        flavorCode: selectedFlavor.resourceSpecCode,
        diskType: configDiskType.trim() || DEFAULT_CATALOG_DISK_TYPE,
        diskSize,
        durationValue,
        quantity,
        pricingMode: catalogPricingMode,
      });
      if (!estimate) {
        throw new Error(`Cached ${getPricingModeLabel(catalogPricingMode)} pricing data is unavailable for ${selectedFlavor.resourceSpecCode} in ${nextRegion}`);
      }

      setCatalogResult(pricingCatalog);
      setCatalogRegions((current) => mergeCatalogRegions(pricingCatalog.regions ?? current, nextRegion));

      const result = buildCachedEstimateResult(
        estimate,
        nextRegion,
        selectedFlavor.resourceSpecCode,
        configDiskType.trim() || DEFAULT_CATALOG_DISK_TYPE,
        diskSize,
        durationValue,
        quantity,
        catalogPricingMode,
      );
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
    const durationValue = getNormalizedDurationValue(catalogPricingMode, configHours);
    const diskSize = Number.parseInt(configDiskSize, 10) || 40;

    const payload = buildCalculatorItemPayload(sampleItem, selectedFlavor, estimateBody, {
      region: catalogRegion.trim() || DEFAULT_REGION,
      quantity,
      durationValue,
      pricingMode: catalogPricingMode,
      diskType: configDiskType.trim() || DEFAULT_CATALOG_DISK_TYPE,
      diskSize,
      title: configTitle.trim() || selectedFlavor.resourceSpecCode,
      description: configDescription.trim() || "Generated from the custom calculator",
    });

    const item: CalculatorItem = {
      id: editingDraftItem?.id ?? `${Date.now()}-${selectedFlavor.resourceSpecCode}`,
      title: configTitle.trim() || selectedFlavor.resourceSpecCode,
      description: configDescription.trim() || "Generated from the custom calculator",
      region: catalogRegion.trim() || DEFAULT_REGION,
      quantity,
      hours: durationValue,
      pricingMode: catalogPricingMode,
      diskPricingMode: getEffectiveDiskPricingMode(catalogPricingMode),
      durationUnit: getPricingDurationUnit(catalogPricingMode),
      diskType: configDiskType.trim() || DEFAULT_CATALOG_DISK_TYPE,
      diskSize,
      flavorCode: selectedFlavor.resourceSpecCode,
      currency: estimateBody.currency ?? "USD",
      totalAmount: estimateBody.amount,
      originalAmount: estimateBody.originalAmount,
      payload,
    };

    setCalculatorItems((current) => {
      if (!editingDraftItem) {
        return [...current, item];
      }

      return current.map((currentItem) => (currentItem.id === editingDraftItem.id ? item : currentItem));
    });
    setEditorTarget(null);
  }

  function removeItem(itemId: string) {
    setCalculatorItems((current) => current.filter((item) => item.id !== itemId));
  }

  async function updateLiveCartItems(nextItems: CalculatorCartItemPayload[]) {
    const template = findTemplate(templates, "edit-cart");
    if (!template || typeof template.bodyJson !== "object" || !template.bodyJson) {
      setAppError("Edit cart template is missing");
      return null;
    }

    if (!selectedCartKey.trim()) {
      setAppError("Select or create a Huawei cart first");
      return null;
    }

    setPublishLoading(true);
    setAppError("");

    try {
      const base = cloneJson(template.bodyJson as EditCartPayload);
      base.name = selectedCartName.trim() || currentCartDetail?.name || "Calculator cart";
      base.billingMode = currentCartDetail?.billingMode || base.billingMode;
      base.cartListData = nextItems.map((item) => cloneJson(item));
      base.totalPrice = buildCartTotalPrice(base.cartListData);

      const result = await replayOne("edit-cart", {
        url: buildCartMutationUrl(template, "update", selectedCartKey.trim()),
        bodyRaw: JSON.stringify(base),
      });

      setPublishResult(result);
      setCartDetailCache((current) => ({
        ...current,
        [selectedCartKey.trim()]: {
          billingMode: base.billingMode,
          cartListData: base.cartListData,
          name: base.name,
          totalPrice: base.totalPrice,
        },
      }));
      await refreshCarts();
      await loadCartDetail(selectedCartKey.trim(), true);
      return result;
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "Failed to update live cart");
      return null;
    } finally {
      setPublishLoading(false);
    }
  }

  async function renameSelectedCart() {
    const template = findTemplate(templates, "edit-cart");
    if (!template || typeof template.bodyJson !== "object" || !template.bodyJson) {
      setAppError("Edit cart template is missing");
      return;
    }

    const trimmedKey = selectedCartKey.trim();
    const trimmedName = selectedCartName.trim();
    if (!trimmedKey) {
      setAppError("Select or create a Huawei cart first");
      return;
    }

    if (!trimmedName) {
      setAppError("Enter a cart name before renaming it");
      return;
    }

    setCartAction("rename");
    setAppError("");

    try {
      const detail = currentCartDetail ?? await loadCartDetail(trimmedKey, false);
      if (!detail) {
        throw new Error("Load the selected cart before renaming it");
      }

      const nextPayload: EditCartPayload = {
        billingMode: detail.billingMode || "cart.shareList.billingModeTotal",
        cartListData: (detail.cartListData ?? []).map((item) => cloneJson(item as CalculatorCartItemPayload)),
        name: trimmedName,
        totalPrice: buildCartTotalPrice((detail.cartListData ?? []).map((item) => cloneJson(item as CalculatorCartItemPayload))),
      };

      const result = await replayOne("edit-cart", {
        url: buildCartMutationUrl(template, "update", trimmedKey),
        bodyRaw: JSON.stringify(nextPayload),
      });

      setPublishResult(result);
      setCartDetailCache((current) => ({
        ...current,
        [trimmedKey]: {
          billingMode: nextPayload.billingMode,
          cartListData: nextPayload.cartListData,
          name: nextPayload.name,
          totalPrice: nextPayload.totalPrice,
        },
      }));
      setCarts((current) => current.map((cart) => (
        cart.key === trimmedKey
          ? {
              ...cart,
              billingMode: nextPayload.billingMode,
              name: nextPayload.name,
              totalPrice: nextPayload.totalPrice,
              updateTime: Date.now(),
            }
          : cart
      )));
      await refreshCarts();
      await loadCartDetail(trimmedKey, true);
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "Failed to rename cart");
    } finally {
      setCartAction(null);
    }
  }

  async function deleteSelectedCart() {
    const template = findTemplate(templates, "edit-cart");
    if (!template || typeof template.bodyJson !== "object" || !template.bodyJson) {
      setAppError("Edit cart template is missing");
      return;
    }

    const trimmedKey = selectedCartKey.trim();
    if (!trimmedKey) {
      setAppError("Select or create a Huawei cart first");
      return;
    }

    const confirmed = window.confirm(`Delete ${selectedCartName.trim() || "this cart"}? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setCartAction("delete");
    setAppError("");

    try {
      const result = await replayOne("edit-cart", {
        url: buildCartMutationUrl(template, "delete", trimmedKey),
        bodyRaw: "",
      });

      setPublishResult(result);
      setCarts((current) => current.filter((cart) => cart.key !== trimmedKey));
      setCartDetailCache((current) => {
        const next = { ...current };
        delete next[trimmedKey];
        return next;
      });
      setEditorTarget((current) => (current?.kind === "remote" ? null : current));
      setCartDetailError("");
      setCartDetailResult(null);

      const fallbackCart = cartsSorted.find((cart) => cart.key !== trimmedKey);
      setSelectedCartKey(fallbackCart?.key ?? "");
      setSelectedCartName(fallbackCart?.name ?? "");

      await refreshCarts();
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "Failed to delete cart");
    } finally {
      setCartAction(null);
    }
  }

  async function deleteRemoteItem(itemId: string) {
    if (!currentCartDetail?.cartListData?.length) {
      setAppError("Load the selected cart before deleting an item");
      return;
    }

    const targetItem = remoteCartItems.find((item) => item.id === itemId);
    if (!targetItem) {
      setAppError("The selected live cart item could not be found");
      return;
    }

    const nextItems = currentCartDetail.cartListData
      .filter((_, index) => index !== targetItem.index)
      .map((item) => cloneJson(item as CalculatorCartItemPayload));

    const result = await updateLiveCartItems(nextItems);
    if (result && editorTarget?.kind === "remote" && editorTarget.id === itemId) {
      setEditorTarget(null);
    }
  }

  async function saveRemoteItemChanges() {
    if (!editingRemoteItem) {
      setAppError("Choose a live cart item to edit first");
      return;
    }

    if (!currentCartDetail?.cartListData?.length) {
      setAppError("Load the selected cart before editing an item");
      return;
    }

    if (!selectedFlavor || !estimateBody) {
      setAppError("Estimate the updated price before saving the live cart item");
      return;
    }

    const quantity = Number.parseInt(configQuantity, 10) || 1;
    const durationValue = getNormalizedDurationValue(catalogPricingMode, configHours);
    const diskSize = Number.parseInt(configDiskSize, 10) || 40;

    const nextPayload = buildCalculatorItemPayload(editingRemoteItem.payload, selectedFlavor, estimateBody, {
      region: catalogRegion.trim() || editingRemoteItem.region,
      quantity,
      durationValue,
      pricingMode: catalogPricingMode,
      diskType: configDiskType.trim() || editingRemoteItem.diskType,
      diskSize,
      title: configTitle.trim() || selectedFlavor.resourceSpecCode,
      description: configDescription.trim() || editingRemoteItem.description,
    });

    const nextItems = currentCartDetail.cartListData.map((item, index) => (
      index === editingRemoteItem.index
        ? nextPayload
        : cloneJson(item as CalculatorCartItemPayload)
    ));

    const result = await updateLiveCartItems(nextItems);
    if (result) {
      setEditorTarget(null);
    }
  }

  async function publishCalculator() {
    if (!selectedCartKey.trim()) {
      setAppError("Select or create a Huawei cart first");
      return;
    }

    if (!calculatorItems.length) {
      setAppError("Add at least one product to the calculator before publishing");
      return;
    }

    await updateLiveCartItems(calculatorItems.map((item) => cloneJson(item.payload)));
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
                Choose a target cart, browse flavors, configure compute and disk, estimate cost, stage multiple
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
                <div className="flex items-center justify-between gap-3">
                  <p className="section-title">Current selection</p>
                  <div className="flex items-center gap-2">
                    <button
                      aria-label="Rename selected cart"
                      className="icon-btn"
                      disabled={!selectedCartKey.trim() || !selectedCartName.trim() || cartAction !== null}
                      onClick={() => void renameSelectedCart()}
                      title="Rename selected cart"
                      type="button"
                    >
                      {cartAction === "rename" ? <SpinnerIcon /> : <PencilIcon />}
                    </button>
                    <button
                      aria-label="Delete selected cart"
                      className="icon-btn icon-btn-danger"
                      disabled={!selectedCartKey.trim() || cartAction !== null}
                      onClick={() => void deleteSelectedCart()}
                      title="Delete selected cart"
                      type="button"
                    >
                      {cartAction === "delete" ? <SpinnerIcon /> : <TrashIcon />}
                    </button>
                  </div>
                </div>
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
                        <div className="flex items-center gap-2">
                          <span className="pill">{item.totalAmount.toFixed(2)}</span>
                          <button className="btn btn-secondary btn-small" disabled={publishLoading} onClick={() => populateEditorFromRemoteItem(item)} type="button">
                            Edit
                          </button>
                          <button className="btn btn-danger btn-small" disabled={publishLoading} onClick={() => void deleteRemoteItem(item.id)} type="button">
                            Delete
                          </button>
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{item.description}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="pill">{item.region}</span>
                        <span className="pill">{getPricingModeLabel(item.pricingMode)}</span>
                        <span className="pill">{item.quantity}x</span>
                        {item.pricingMode === "RI" ? null : <span className="pill">{formatDuration(item.pricingMode, item.hours)}</span>}
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
                        <div className="flex items-center gap-2">
                          <button className="btn btn-secondary btn-small" onClick={() => populateEditorFromDraftItem(item)} type="button">
                            Edit
                          </button>
                          <button className="btn btn-danger btn-small" onClick={() => removeItem(item.id)} type="button">
                            Delete
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="pill">{getPricingModeLabel(item.pricingMode)}</span>
                        <span className="pill">{item.quantity}x</span>
                        {item.pricingMode === "RI" ? null : <span className="pill">{formatDuration(item.pricingMode, item.hours)}</span>}
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
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="label" htmlFor="catalog-region">
                      Region
                    </label>
                    <select className="field min-w-[220px]" id="catalog-region" onChange={(event) => setCatalogRegion(event.target.value)} value={catalogRegion}>
                      {catalogRegionOptions.map((region) => (
                        <option key={region.id} value={region.id}>
                          {region.name === region.id ? region.id : `${region.name} (${region.id})`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="catalog-pricing-mode">
                      Pricing type
                    </label>
                    <select className="field min-w-[180px]" id="catalog-pricing-mode" onChange={(event) => setCatalogPricingMode(event.target.value as CatalogPricingMode)} value={catalogPricingMode}>
                      {PRICING_MODE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
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
                      <input className="field" id="catalog-min-vcpu" onChange={(event) => setCatalogMinVcpu(event.target.value)} value={catalogMinVcpu} />
                    </div>
                    <div>
                      <label className="label" htmlFor="catalog-min-ram">
                        Min RAM (GB)
                      </label>
                      <input className="field" id="catalog-min-ram" onChange={(event) => setCatalogMinRam(event.target.value)} value={catalogMinRam} />
                    </div>
                  </div>

                  <label className="label mt-3" htmlFor="catalog-sort">
                    Sort by base price
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
                    <span>{getPricingRateLabel(catalogPricingMode)}</span>
                  </div>

                  <div className="flavor-matrix-body mt-2 space-y-2">
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
                          {Number.isFinite(getFlavorBasePrice(flavor, catalogPricingMode)) ? getFlavorBasePrice(flavor, catalogPricingMode).toFixed(4) : "-"}
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

              {editorTarget ? (
                <div className="result-strip mt-4 flex flex-wrap items-center justify-between gap-3 border-sky-200 bg-sky-50">
                  <div>
                    <p className="text-sm font-semibold text-sky-900">
                      {editorTarget.kind === "remote" ? "Editing live cart item" : "Editing draft item"}
                    </p>
                    <p className="mt-1 text-sm text-sky-800">
                      {editorTarget.kind === "remote"
                        ? "Estimate the updated configuration, then save changes directly to the selected Huawei cart."
                        : "Estimate the updated configuration, then save it back into the draft queue."}
                    </p>
                  </div>
                  <button className="btn btn-secondary btn-small" onClick={cancelEditor} type="button">
                    Cancel edit
                  </button>
                </div>
              ) : null}

              <div className="mt-5 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
                <div className="soft-panel">
                  <p className="section-title">Configuration</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label" htmlFor="config-title">
                        Product title
                      </label>
                      <input className="field" id="config-title" onChange={(event) => setConfigTitle(event.target.value)} value={configTitle} />
                    </div>
                    {catalogPricingMode === "RI" ? (
                      <div>
                        <label className="label">RI pricing</label>
                        <div className="field flex min-h-11 items-center bg-slate-50 text-sm text-slate-600">
                          One-time RI purchase price per instance
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="label" htmlFor="config-hours">
                          {getPricingDurationLabel(catalogPricingMode)}
                        </label>
                        <select className="field" id="config-hours" onChange={(event) => setConfigHours(event.target.value)} value={configHours}>
                          {configHourOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="label" htmlFor="config-quantity">
                        Quantity
                      </label>
                      <select className="field" id="config-quantity" onChange={(event) => setConfigQuantity(event.target.value)} value={configQuantity}>
                        {configQuantityOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor="config-disk-type">
                        Disk type
                      </label>
                      <select className="field" id="config-disk-type" onChange={(event) => setConfigDiskType(event.target.value)} value={configDiskType}>
                        {configDiskTypeOptions.map((option) => {
                          const disk = catalogDisks.find((item) => item.resourceSpecCode === option);
                          return (
                            <option key={option} value={option}>
                              {disk ? getDiskTypeLabel(disk) : option}
                            </option>
                          );
                        })}
                      </select>
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
                      <p className="mt-3 text-sm font-semibold text-slate-900">
                        {getPricingRateLabel(catalogPricingMode)}: {selectedFlavorSupportsPricingMode ? selectedFlavorPrice.toFixed(4) : "-"}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="pill">{getPricingModeLabel(catalogPricingMode)}</span>
                        {catalogPricingMode === "RI"
                          ? <span className="pill">Disk pricing excluded</span>
                          : <span className="pill">Disk: {getPricingModeLabel(getEffectiveDiskPricingMode(catalogPricingMode))}</span>}
                      </div>
                      {!selectedFlavorSupportsPricingMode ? (
                        <p className="mt-3 text-sm text-amber-700">
                          This flavor does not expose {getPricingModeLabel(catalogPricingMode)} pricing in the cached Huawei catalog for {catalogRegion}.
                        </p>
                      ) : null}
                      {catalogPricingMode === "RI" ? (
                        <p className="mt-3 text-sm text-slate-600">
                          RI uses Huawei&apos;s RI purchase price. Disk pricing is excluded because the cached disk catalog does not expose RI plans.
                        </p>
                      ) : null}
                      <p className="mt-4 text-sm leading-6 text-slate-600">
                        {selectedFlavor.productSpecDesc || selectedFlavor.productSpecSysDesc || "No description available"}
                      </p>
                    </>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">Load the catalog and choose a flavor first.</p>
                  )}

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button className="btn btn-primary" disabled={estimateLoading || loadingTemplates || !selectedFlavor || !selectedFlavorSupportsPricingMode} onClick={() => void estimatePrice()} type="button">
                      {estimateLoading ? "Estimating..." : `Estimate ${getPricingModeLabel(catalogPricingMode)} price`}
                    </button>
                    <button className="btn btn-secondary" disabled={!estimateBody} onClick={addEstimatedItem} type="button">
                      {editorTarget?.kind === "draft" ? "Save draft changes" : "Add product to draft"}
                    </button>
                    {editorTarget?.kind === "remote" ? (
                      <button className="btn btn-secondary" disabled={!estimateBody || publishLoading} onClick={() => void saveRemoteItemChanges()} type="button">
                        {publishLoading ? "Saving..." : "Save changes to live cart"}
                      </button>
                    ) : null}
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
