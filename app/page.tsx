"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  buildCatalogDiskPriceEstimate,
  buildCatalogPriceEstimate,
  getCatalogDisks,
  getDiskBasePrice,
  getEffectiveDiskPricingMode,
  getCatalogFlavors,
  getFlavorBasePrice,
  getFlavorCpuCount,
  getFlavorMemoryGb,
  selectCheapestFlavorForRequirements,
  type CatalogPricingMode,
  type PriceResponseBody,
  type ProductDisk,
  type ProductFlavor,
} from "@/lib/catalog";
import {
  BRAZIL_REGION,
  buildDuplicateCartName,
  getDefaultBillingConversionTarget,
  getDefaultRegionConversionTarget,
  getDominantCartRegion,
  SANTIAGO_REGION,
} from "@/lib/cart-conversion";
import {
  DISK_TYPE_OPTIONS,
  getDiskTypeDisplayName,
  normalizeDiskTypeApiCode,
} from "@/lib/disk-types";
import {
  buildEcsSystemDiskPayload,
  getEcsSystemDiskStepperType,
} from "@/lib/ecs-payload";
import {
  buildEvsBuyUrl,
  buildEvsDiskPayloadFields,
  buildEvsPayloadLabels,
} from "@/lib/evs-payload";

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
    serviceCode?: string;
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

type CalculatorService = "ecs" | "evs";

type RemoteCartItem = {
  id: string;
  index: number;
  service: CalculatorService;
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
  resourceCode: string;
  vcpus: number;
  ramGb: number;
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
  service: CalculatorService;
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
  resourceCode: string;
  currency: string;
  totalAmount: number;
  originalAmount: number;
  payload: CalculatorCartItemPayload;
};

type BulkEcsRequest = {
  name: string;
  vcpus: number;
  ram: number;
};

type BulkEcsMatch = {
  request: BulkEcsRequest;
  flavorCode: string;
  matchedVcpus: number;
  matchedRamGb: number;
  totalAmount: number;
  currency: string;
};

type BulkEvsRequest = {
  name?: string;
  size: number;
  type?: string;
};

type BulkEvsMatch = {
  request: BulkEvsRequest;
  diskType: string;
  diskSizes: number[];
  totalAmount: number;
  currency: string;
};

type EcsCalculatorItemConfig = {
  id?: string;
  region: string;
  quantity: number;
  durationValue: number;
  pricingMode: CatalogPricingMode;
  diskType: string;
  diskSize: number;
  title: string;
  description: string;
};

type EvsCalculatorItemConfig = {
  id?: string;
  region: string;
  quantity: number;
  durationValue: number;
  pricingMode: Exclude<CatalogPricingMode, "RI">;
  diskType: string;
  diskSize: number;
  title: string;
  description: string;
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
const DEFAULT_REGION = BRAZIL_REGION;
const DEFAULT_CATALOG_DISK_TYPE = "SAS";
const DEFAULT_CATALOG_DISK_SIZE = "40";
const DEFAULT_SERVICE: CalculatorService = "ecs";
const DEFAULT_ECS_DESCRIPTION = "Elastic Cloud Server";
const DEFAULT_EVS_DESCRIPTION = "Elastic Volume Service";
const MAX_EVS_DISK_SIZE_GB = 32768;
const DEFAULT_PRICING_MODE: CatalogPricingMode = "ONDEMAND";
const PRICING_MODE_OPTIONS: Array<{ value: CatalogPricingMode; label: string }> = [
  { value: "ONDEMAND", label: "On-demand" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "YEARLY", label: "Yearly" },
  { value: "RI", label: "RI (1 year)" },
];
const SERVICE_OPTIONS: Array<{ value: CalculatorService; label: string; description: string }> = [
  { value: "ecs", label: "ECS", description: "Elastic Cloud Server" },
  { value: "evs", label: "EVS", description: "Elastic Volume Service" },
];
const BILLING_CONVERSION_OPTIONS: Array<{ value: "ONDEMAND" | "RI"; label: string }> = [
  { value: "ONDEMAND", label: "Pay-per-use ECS" },
  { value: "RI", label: "RI ECS (1 year)" },
];

function isCatalogPricingMode(value: string): value is CatalogPricingMode {
  return PRICING_MODE_OPTIONS.some((option) => option.value === value);
}

function getPricingModeOptions(service: CalculatorService) {
  return service === "evs"
    ? PRICING_MODE_OPTIONS.filter((option) => option.value !== "RI")
    : PRICING_MODE_OPTIONS;
}

function getPricingModeLabel(pricingMode: CatalogPricingMode, service: CalculatorService = "ecs"): string {
  return getPricingModeOptions(service).find((option) => option.value === pricingMode)?.label ?? pricingMode;
}

function getPricingRateLabel(pricingMode: CatalogPricingMode): string {
  switch (pricingMode) {
    case "MONTHLY":
      return "Base monthly price";
    case "YEARLY":
      return "Base yearly price";
    case "RI":
      return "1-year RI price";
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

function getDefaultPricingMode(service: CalculatorService): CatalogPricingMode {
  return getPricingModeOptions(service)[0]?.value ?? DEFAULT_PRICING_MODE;
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

function getStoredService(item: ShareCartItemPayload): CalculatorService {
  const selectedProduct = item.selectedProduct ?? {};
  const serviceCode = selectedProduct.serviceCode?.trim().toLowerCase() ?? "";
  if (serviceCode === "evs") {
    return "evs";
  }

  const productInfos = Array.isArray(selectedProduct.productAllInfos) ? selectedProduct.productAllInfos : [];
  const hasVm = productInfos.some((info) => typeof info?.resourceType === "string" && info.resourceType.includes(".vm"));
  const hasSingleDisk = productInfos.length === 1 && productInfos.every((info) => typeof info?.resourceType === "string" && info.resourceType.includes(".volume"));
  return hasSingleDisk && !hasVm ? "evs" : "ecs";
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

function parseBulkEcsRequests(input: string): BulkEcsRequest[] {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Paste at least one ECS request");
  }

  const tryParse = (value: string) => JSON.parse(value) as unknown;
  let parsed: unknown;

  try {
    parsed = tryParse(trimmed);
  } catch {
    const normalized = trimmed
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|\s)\/\/.*$/gm, "")
      .replace(/([{,]\s*)([A-Za-z_$][\w$]*)(\s*:)/g, "$1\"$2\"$3")
      .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, value: string) => `"${value.replace(/\"/g, '"').replace(/"/g, '\\"')}"`)
      .replace(/,\s*([}\]])/g, "$1");
    parsed = tryParse(normalized);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("The ECS input must be an array of objects");
  }

  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`ECS item ${index + 1} must be an object`);
    }

    const candidate = entry as Record<string, unknown>;
    const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    const vcpus = typeof candidate.vcpus === "number" ? candidate.vcpus : Number(candidate.vcpus);
    const ram = typeof candidate.ram === "number" ? candidate.ram : Number(candidate.ram);

    if (!name) {
      throw new Error(`ECS item ${index + 1} is missing a name`);
    }
    if (!Number.isFinite(vcpus) || vcpus <= 0) {
      throw new Error(`ECS item ${index + 1} must include a positive vcpus value`);
    }
    if (!Number.isFinite(ram) || ram <= 0) {
      throw new Error(`ECS item ${index + 1} must include a positive ram value`);
    }

    return {
      name,
      vcpus,
      ram,
    };
  });
}

function parseBulkEvsRequests(input: string): BulkEvsRequest[] {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Paste at least one EVS request");
  }

  const tryParse = (value: string) => JSON.parse(value) as unknown;
  let parsed: unknown;

  try {
    parsed = tryParse(trimmed);
  } catch {
    const normalized = trimmed
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|\s)\/\/.*$/gm, "")
      .replace(/([{,]\s*)([A-Za-z_$][\w$]*)(\s*:)/g, "$1\"$2\"$3")
      .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, value: string) => `"${value.replace(/\"/g, '"').replace(/"/g, '\\"')}"`)
      .replace(/,\s*([}\]])/g, "$1");
    parsed = tryParse(normalized);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("The EVS input must be an array of objects");
  }

  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`EVS item ${index + 1} must be an object`);
    }

    const candidate = entry as Record<string, unknown>;
    const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    const size = typeof candidate.size === "number" ? candidate.size : Number(candidate.size);
    const type = typeof candidate.type === "string" ? normalizeDiskTypeApiCode(candidate.type) : "";

    if (!Number.isFinite(size) || size <= 0) {
      throw new Error(`EVS item ${index + 1} must include a positive size value`);
    }

    return {
      ...(name ? { name } : {}),
      size,
      ...(type ? { type } : {}),
    };
  });
}

function isCatalogLoadedForRegion(result: CatalogCacheResult | null, region: string): boolean {
  return result?.cache?.region?.trim() === region.trim();
}

function getFlavorLabel(flavor: ProductFlavor): string {
  const bits = [flavor.cpu, flavor.mem, flavor.performType].filter(Boolean);
  return bits.length ? bits.join(" / ") : flavor.resourceSpecCode;
}

function createCalculatorItemId(resourceCode: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${resourceCode}`;
}

function getFlavorSpec(flavor: ProductFlavor): string {
  if (typeof flavor.spec === "string" && flavor.spec) {
    return flavor.spec;
  }

  return flavor.resourceSpecCode.replace(/\.linux$/, "");
}

function formatDiskLabel(diskType: string, diskSize: number): string {
  const label = getDiskTypeDisplayName(diskType);
  return diskSize > 0 ? `${label} ${diskSize}GB` : label;
}

function splitDiskSize(totalSize: number): number[] {
  const normalized = Math.max(0, Math.floor(totalSize));
  if (!normalized) {
    return [];
  }

  const chunks: number[] = [];
  let remaining = normalized;
  while (remaining > 0) {
    const nextSize = Math.min(MAX_EVS_DISK_SIZE_GB, remaining);
    chunks.push(nextSize);
    remaining -= nextSize;
  }

  return chunks;
}

function buildSplitDiskTitle(baseTitle: string, index: number, total: number): string {
  const trimmed = baseTitle.trim() || DEFAULT_EVS_DESCRIPTION;
  return total > 1 ? `${trimmed} ${index + 1}/${total}` : trimmed;
}

function resolveItemDescription(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed || fallback;
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
    const service = getStoredService(item);
    const productInfos = Array.isArray(selectedProduct.productAllInfos) ? selectedProduct.productAllInfos : [];
    const vmInfo = (productInfos.find((info) => typeof info?.resourceType === "string" && info.resourceType.includes(".vm")) ?? productInfos[0] ?? {}) as Record<string, unknown>;
    const diskInfo = (productInfos.find((info) => typeof info?.resourceType === "string" && info.resourceType.includes(".volume")) ?? productInfos[2] ?? productInfos[0] ?? {}) as Record<string, unknown>;
    const pricingMode = getStoredPricingMode(item);
    const durationUnit = selectedProduct.calculatorDurationUnit?.trim() || getPricingDurationUnit(pricingMode);
    const storedDiskPricingMode = selectedProduct.calculatorDiskPricingMode?.trim() ?? "";
    const resourceCode = service === "ecs"
      ? (typeof vmInfo.resourceSpecCode === "string" ? vmInfo.resourceSpecCode : "Unknown flavor")
      : normalizeDiskTypeApiCode(typeof diskInfo.resourceSpecCode === "string" ? diskInfo.resourceSpecCode : "Unknown disk");
    const diskType = normalizeDiskTypeApiCode(typeof diskInfo.resourceSpecCode === "string" ? diskInfo.resourceSpecCode : "Disk");
    const diskSize = typeof diskInfo.resourceSize === "number" ? diskInfo.resourceSize : 0;
    const storedDescription = selectedProduct.description?.trim()
      || (typeof item.rewriteValue?.global_DESCRIPTION === "string" ? item.rewriteValue.global_DESCRIPTION.trim() : "")
      || selectedProduct._customTitle?.trim()
      || (service === "ecs" ? DEFAULT_ECS_DESCRIPTION : DEFAULT_EVS_DESCRIPTION);
    const title = storedDescription
      || (service === "ecs" ? resourceCode : formatDiskLabel(diskType, diskSize))
      || `Item ${index + 1}`;
    const vmFlavor = vmInfo as ProductFlavor;

    return {
      id: `${service}-${resourceCode}-${index}`,
      index,
      service,
      title,
      description: storedDescription,
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
      diskLabel: formatDiskLabel(diskType, diskSize),
      resourceCode,
      vcpus: service === "ecs" ? getFlavorCpuCount(vmFlavor) : 0,
      ramGb: service === "ecs" ? getFlavorMemoryGb(vmFlavor) : 0,
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

function buildEcsBuyUrl(
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

function buildEcsCalculatorItemPayload(
  sampleItem: CalculatorCartItemPayload,
  flavor: ProductFlavor,
  disk: ProductDisk,
  priceResponse: PriceResponseBody,
  config: EcsCalculatorItemConfig,
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

  payload.buyUrl = buildEcsBuyUrl(payload.buyUrl ?? "", config.region, flavor, config.diskType, config.diskSize, config.quantity);

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
  evsMain.type = getEcsSystemDiskStepperType(disk, diskInfo);
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

  productAllInfos[2] = buildEcsSystemDiskPayload({
    existingDiskInfo: diskInfo,
    disk,
    diskSize: config.diskSize,
    quantity: config.quantity,
    durationValue: config.durationValue,
    pricingMode: config.pricingMode,
    diskRating,
  });

  selectedProduct.productAllInfos = productAllInfos;
  payload.selectedProduct = selectedProduct;
  payload.rewriteValue = rewriteValue;

  return payload;
}

function buildEvsCalculatorItemPayload(
  sampleItem: CalculatorCartItemPayload,
  disk: ProductDisk,
  priceResponse: PriceResponseBody,
  config: EvsCalculatorItemConfig,
): CalculatorCartItemPayload {
  const payload = cloneJson(sampleItem);
  const selectedProduct = payload.selectedProduct as Record<string, unknown>;
  const rewriteValue = payload.rewriteValue as Record<string, unknown>;
  const existingInfos = Array.isArray(selectedProduct.productAllInfos)
    ? (selectedProduct.productAllInfos as Array<Record<string, unknown>>)
    : [];
  const diskInfo = existingInfos.find((info) => typeof info?.resourceType === "string" && info.resourceType.includes(".volume")) ?? existingInfos[2] ?? existingInfos[0] ?? {};
  const diskRating = priceResponse.productRatingResult?.[0];
  const durationUnit = getPricingDurationUnit(config.pricingMode);
  const diskTypeApiCode = normalizeDiskTypeApiCode(config.diskType);
  const payloadLabels = buildEvsPayloadLabels({
    productType: typeof disk.productType === "string"
      ? disk.productType
      : typeof (diskInfo as { productType?: unknown }).productType === "string"
        ? (diskInfo as { productType: string }).productType
        : null,
    resourceMeasureName: typeof disk.resourceMeasureName === "string"
      ? disk.resourceMeasureName
      : typeof (diskInfo as { resourceMeasureName?: unknown }).resourceMeasureName === "string"
        ? (diskInfo as { resourceMeasureName: string }).resourceMeasureName
        : null,
    resourceMeasurePluralName: typeof disk.resourceMeasurePluralName === "string"
      ? disk.resourceMeasurePluralName
      : typeof (diskInfo as { resourceMeasurePluralName?: unknown }).resourceMeasurePluralName === "string"
        ? (diskInfo as { resourceMeasurePluralName: string }).resourceMeasurePluralName
        : null,
    addToListTitle: typeof disk.addToList_title === "string"
      ? disk.addToList_title
      : typeof (diskInfo as { addToList_title?: unknown }).addToList_title === "string"
        ? (diskInfo as { addToList_title: string }).addToList_title
        : null,
    quantityMeasureName: typeof (selectedProduct.purchaseNum as { measureNameBeforeTrans?: unknown } | undefined)?.measureNameBeforeTrans === "string"
      ? (selectedProduct.purchaseNum as { measureNameBeforeTrans: string }).measureNameBeforeTrans
      : null,
    quantityMeasurePluralName: typeof (selectedProduct.purchaseNum as { measurePluralNameBeforeTrans?: unknown } | undefined)?.measurePluralNameBeforeTrans === "string"
      ? (selectedProduct.purchaseNum as { measurePluralNameBeforeTrans: string }).measurePluralNameBeforeTrans
      : null,
  });
  const diskPayloadFields = buildEvsDiskPayloadFields({
    diskType: diskTypeApiCode,
    diskSize: config.diskSize,
    labels: payloadLabels,
    resourceSpecType: typeof disk.resourceSpecType === "string"
      ? disk.resourceSpecType
      : typeof (diskInfo as { resourceSpecType?: unknown }).resourceSpecType === "string"
        ? (diskInfo as { resourceSpecType: string }).resourceSpecType
        : null,
    volumeType: typeof disk.volumeType === "string"
      ? disk.volumeType
      : typeof (diskInfo as { volumeType?: unknown }).volumeType === "string"
        ? (diskInfo as { volumeType: string }).volumeType
        : null,
    productSpecSysDesc: typeof disk.productSpecSysDesc === "string"
      ? disk.productSpecSysDesc
      : typeof (diskInfo as { productSpecSysDesc?: unknown }).productSpecSysDesc === "string"
        ? (diskInfo as { productSpecSysDesc: string }).productSpecSysDesc
        : null,
  });

  payload.buyUrl = buildEvsBuyUrl({
    region: config.region,
    pricingMode: config.pricingMode,
    diskType: diskTypeApiCode,
    diskSize: config.diskSize,
    quantity: config.quantity,
  });

  rewriteValue.global_DESCRIPTION = config.description;
  rewriteValue.global_TITLE = {
    tag: selectedProduct.tag ?? "general.online.portal",
  };
  rewriteValue.global_PRICINGMODE = config.pricingMode;
  rewriteValue.global_DISKPRICINGMODE = config.pricingMode;
  rewriteValue.global_DURATIONUNIT = durationUnit;
  rewriteValue.global_REGIONINFO = {
    region: config.region,
    locationType: "commonAZ",
    chargeMode: config.pricingMode,
  };

  rewriteValue.template_RENDER = {
    calculator_product_stepper: {
      productType: payloadLabels.productType,
      UNSET_Stepper_0: {
        measureId: 17,
        measureValue: config.diskSize,
        measureNameBeforeTrans: payloadLabels.resourceMeasureName,
        measurePluralNameBeforeTrans: payloadLabels.resourceMeasurePluralName,
        transRate: "",
        transTarget: "",
      },
    },
  };

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
      measureNameBeforeTrans: payloadLabels.quantityMeasureName,
      measurePluralNameBeforeTrans: payloadLabels.quantityMeasurePluralName,
      transRate: "",
      transTarget: "",
    },
  };

  selectedProduct.region = config.region;
  selectedProduct.locationType = "commonAZ";
  selectedProduct.tag = "general.online.portal";
  selectedProduct.serviceCode = "evs";
  selectedProduct.timeTag = Date.now();
  selectedProduct.description = config.description;
  selectedProduct._customTitle = config.title;
  selectedProduct.chargeMode = config.pricingMode;
  selectedProduct.chargeModeName = config.pricingMode;
  selectedProduct.periodType = 4;
  selectedProduct.periodNum = 1;
  selectedProduct.subscriptionNum = 1;
  selectedProduct.calculatorPricingMode = config.pricingMode;
  selectedProduct.calculatorDiskPricingMode = config.pricingMode;
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
    measureNameBeforeTrans: payloadLabels.quantityMeasureName,
    measurePluralNameBeforeTrans: payloadLabels.quantityMeasurePluralName,
  };

  selectedProduct.productAllInfos = [
    {
      ...(diskInfo as Record<string, unknown>),
      ...disk,
      ...diskPayloadFields,
      resourceType: disk.resourceType ?? (diskInfo as Record<string, unknown>).resourceType ?? "hws.resource.type.volume",
      cloudServiceType: disk.cloudServiceType ?? (diskInfo as Record<string, unknown>).cloudServiceType ?? "hws.service.type.ebs",
      resourceSize: config.diskSize,
      productNum: config.quantity,
      selfProductNum: config.quantity,
      billingMode: config.pricingMode,
      usageValue: config.durationValue,
      inquiryResult: {
        ...(((diskInfo as Record<string, unknown>).inquiryResult as Record<string, unknown>) ?? {}),
        id: diskRating?.id ?? (((diskInfo as Record<string, unknown>).inquiryResult as Record<string, unknown>)?.id),
        productId: diskRating?.productId ?? disk.productId ?? (diskInfo as Record<string, unknown>).productId,
        amount: diskRating?.amount ?? (diskInfo as Record<string, unknown>).amount,
        discountAmount: diskRating?.discountAmount ?? 0,
        originalAmount: diskRating?.originalAmount ?? (diskInfo as Record<string, unknown>).originalAmount ?? (diskInfo as Record<string, unknown>).amount,
        perAmount: null,
        perDiscountAmount: null,
        perOriginalAmount: null,
        perPeriodType: null,
        measureId: 1,
        extendParams: null,
      },
    },
  ];

  payload.selectedProduct = selectedProduct;
  payload.rewriteValue = rewriteValue;

  return payload;
}

function buildEcsCalculatorItem(
  sampleItem: CalculatorCartItemPayload,
  flavor: ProductFlavor,
  disk: ProductDisk,
  priceResponse: PriceResponseBody,
  config: EcsCalculatorItemConfig,
): CalculatorItem {
  const payload = buildEcsCalculatorItemPayload(sampleItem, flavor, disk, priceResponse, config);

  return {
    id: config.id ?? createCalculatorItemId(flavor.resourceSpecCode),
    service: "ecs",
    title: config.title,
    description: config.description,
    region: config.region,
    quantity: config.quantity,
    hours: config.durationValue,
    pricingMode: config.pricingMode,
    diskPricingMode: getEffectiveDiskPricingMode(config.pricingMode),
    durationUnit: getPricingDurationUnit(config.pricingMode),
    diskType: config.diskType,
    diskSize: config.diskSize,
    resourceCode: flavor.resourceSpecCode,
    currency: priceResponse.currency ?? "USD",
    totalAmount: priceResponse.amount,
    originalAmount: priceResponse.originalAmount,
    payload,
  };
}

function buildEvsCalculatorItem(
  sampleItem: CalculatorCartItemPayload,
  disk: ProductDisk,
  priceResponse: PriceResponseBody,
  config: EvsCalculatorItemConfig,
): CalculatorItem {
  const payload = buildEvsCalculatorItemPayload(sampleItem, disk, priceResponse, config);

  return {
    id: config.id ?? createCalculatorItemId(`${config.diskType}-${config.diskSize}`),
    service: "evs",
    title: config.title,
    description: config.description,
    region: config.region,
    quantity: config.quantity,
    hours: config.durationValue,
    pricingMode: config.pricingMode,
    diskPricingMode: config.pricingMode,
    durationUnit: getPricingDurationUnit(config.pricingMode),
    diskType: config.diskType,
    diskSize: config.diskSize,
    resourceCode: config.diskType,
    currency: priceResponse.currency ?? "USD",
    totalAmount: priceResponse.amount,
    originalAmount: priceResponse.originalAmount,
    payload,
  };
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
  const [conversionAction, setConversionAction] = useState<"billing" | "region" | null>(null);
  const [conversionSummary, setConversionSummary] = useState("");
  const [cartPage, setCartPage] = useState(1);
  const [cartDetailLoading, setCartDetailLoading] = useState(false);
  const [cartDetailError, setCartDetailError] = useState("");
  const [cartDetailResult, setCartDetailResult] = useState<CartDetailResult | null>(null);
  const [cartDetailCache, setCartDetailCache] = useState<Record<string, ShareCartDetail>>({});
  const [billingConversionMode, setBillingConversionMode] = useState<"ONDEMAND" | "RI">("RI");
  const [regionConversionTarget, setRegionConversionTarget] = useState(DEFAULT_REGION);

  const [catalogRegion, setCatalogRegion] = useState(DEFAULT_REGION);
  const [catalogRegions, setCatalogRegions] = useState<CatalogRegion[]>([
    { id: DEFAULT_REGION, name: DEFAULT_REGION },
  ]);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogMinVcpu, setCatalogMinVcpu] = useState("0");
  const [catalogMinRam, setCatalogMinRam] = useState("0");
  const [catalogSort, setCatalogSort] = useState("price-asc");
  const [catalogPricingMode, setCatalogPricingMode] = useState<CatalogPricingMode>(DEFAULT_PRICING_MODE);
  const [selectedService, setSelectedService] = useState<CalculatorService>(DEFAULT_SERVICE);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogResult, setCatalogResult] = useState<CatalogCacheResult | null>(null);
  const [selectedFlavorCode, setSelectedFlavorCode] = useState("");
  const [flavorPage, setFlavorPage] = useState(1);

  const [configDiskType, setConfigDiskType] = useState(DEFAULT_CATALOG_DISK_TYPE);
  const [configDiskSize, setConfigDiskSize] = useState(DEFAULT_CATALOG_DISK_SIZE);
  const [configHours, setConfigHours] = useState("744");
  const [configQuantity, setConfigQuantity] = useState("1");
  const [configDescription, setConfigDescription] = useState(DEFAULT_ECS_DESCRIPTION);
  const [bulkEcsInput, setBulkEcsInput] = useState(`[
  { name: "VM 1vCPU 16GB", vcpus: 1, ram: 16 },
  { name: "VM 2vCPU 4GB", vcpus: 2, ram: 4 }
]`);
  const [bulkDiskType, setBulkDiskType] = useState(DEFAULT_CATALOG_DISK_TYPE);
  const [bulkDiskSize, setBulkDiskSize] = useState(DEFAULT_CATALOG_DISK_SIZE);
  const [bulkMatchLoading, setBulkMatchLoading] = useState(false);
  const [bulkMatchSummary, setBulkMatchSummary] = useState("");
  const [bulkMatchResults, setBulkMatchResults] = useState<BulkEcsMatch[]>([]);
  const [bulkEvsInput, setBulkEvsInput] = useState(`[
  { name: "Data volume", size: 40 },
  { size: 40000 }
]`);
  const [bulkEvsLoading, setBulkEvsLoading] = useState(false);
  const [bulkEvsSummary, setBulkEvsSummary] = useState("");
  const [bulkEvsResults, setBulkEvsResults] = useState<BulkEvsMatch[]>([]);

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
  const disks = getCatalogDisks(catalogResult?.response.body);
  const deferredCatalogSearch = useDeferredValue(catalogSearch);
  const deferredSelectedCartKey = useDeferredValue(selectedCartKey);
  const pricingModeOptions = useMemo(() => getPricingModeOptions(selectedService), [selectedService]);
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
  const selectedDisk = disks.find((disk) => disk.resourceSpecCode === configDiskType) ?? null;
  const selectedFlavorPrice = selectedFlavor ? getFlavorBasePrice(selectedFlavor, catalogPricingMode) : Number.POSITIVE_INFINITY;
  const selectedFlavorSupportsPricingMode = Number.isFinite(selectedFlavorPrice);
  const selectedDiskPrice = selectedDisk && selectedService === "evs"
    ? getDiskBasePrice(selectedDisk, catalogPricingMode as Exclude<CatalogPricingMode, "RI">)
    : Number.POSITIVE_INFINITY;
  const selectedDiskSupportsPricingMode = selectedService === "evs" && Number.isFinite(selectedDiskPrice);
  const estimateBody = estimateResult?.response.body as PriceResponseBody | undefined;
  const stagedTotal = calculatorItems.reduce((sum, item) => sum + item.totalAmount, 0);
  const currentCartDetail = selectedCartKey ? cartDetailCache[selectedCartKey] ?? null : null;
  const remoteCartItems = useMemo(() => getRemoteCartItems(currentCartDetail), [currentCartDetail]);
  const remoteCartTotal = currentCartDetail?.totalPrice?.amount ?? remoteCartItems.reduce((sum, item) => sum + item.totalAmount, 0);
  const dominantCartRegion = useMemo(() => getDominantCartRegion(remoteCartItems), [remoteCartItems]);
  const editingDraftItem = editorTarget?.kind === "draft" ? calculatorItems.find((item) => item.id === editorTarget.id) ?? null : null;
  const editingRemoteItem = editorTarget?.kind === "remote" ? remoteCartItems.find((item) => item.id === editorTarget.id) ?? null : null;
  const cartsPerPage = 6;
  const flavorsPerPage = 12;
  const totalCartPages = Math.max(1, Math.ceil(cartsSorted.length / cartsPerPage));
  const totalFlavorPages = Math.max(1, Math.ceil(filteredFlavors.length / flavorsPerPage));
  const paginatedCarts = cartsSorted.slice((cartPage - 1) * cartsPerPage, cartPage * cartsPerPage);
  const paginatedFlavors = filteredFlavors.slice((flavorPage - 1) * flavorsPerPage, flavorPage * flavorsPerPage);
  const catalogRegionOptions = useMemo(() => mergeCatalogRegions(catalogRegions, catalogRegion), [catalogRegion, catalogRegions]);
  const regionConversionOptions = useMemo(
    () => mergeCatalogRegions(catalogRegions, dominantCartRegion, BRAZIL_REGION, SANTIAGO_REGION, regionConversionTarget),
    [catalogRegions, dominantCartRegion, regionConversionTarget],
  );
  const serviceOptions = SERVICE_OPTIONS;
  const configDiskTypeOptions = useMemo(() => withCurrentOption(
    DISK_TYPE_OPTIONS.map((option) => option.apiCode),
    configDiskType,
  ), [configDiskType]);
  const bulkDiskTypeOptions = useMemo(() => withCurrentOption(
    DISK_TYPE_OPTIONS.map((option) => option.apiCode),
    bulkDiskType,
  ), [bulkDiskType]);
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
    const allowedPricingModes = getPricingModeOptions(selectedService).map((option) => option.value);
    if (!allowedPricingModes.includes(catalogPricingMode)) {
      setCatalogPricingMode(getDefaultPricingMode(selectedService));
      return;
    }

    setEstimateResult(null);
    if (selectedService === "ecs") {
      setConfigDescription((current) => current || DEFAULT_ECS_DESCRIPTION);
    } else {
      setConfigDescription((current) => current || DEFAULT_EVS_DESCRIPTION);
    }
  }, [catalogPricingMode, selectedService]);

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

  useEffect(() => {
    setBillingConversionMode(getDefaultBillingConversionTarget(remoteCartItems));
    setRegionConversionTarget(getDefaultRegionConversionTarget(dominantCartRegion || DEFAULT_REGION));
    setConversionSummary("");
  }, [dominantCartRegion, remoteCartItems, selectedCartKey]);

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

  async function fetchEvsCatalog(region: string): Promise<CatalogCacheResult> {
    return fetchRemoteCatalog(region, "evs");
  }

  async function fetchRemoteCatalog(region: string, service: CalculatorService): Promise<CatalogCacheResult> {
    const template = findTemplate(templates, "get-product-options-and-info");
    if (!template) {
      throw new Error("Catalog template is missing");
    }

    const url = new URL(template.url);
    url.searchParams.set("urlPath", service);
    url.searchParams.set("region", region);

    const response = await fetch("/api/replay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "get-product-options-and-info",
        url: url.toString(),
        useCapturedAuth: false,
      }),
    });

    const data = (await response.json()) as CatalogCacheResult;
    if (!response.ok) {
      throw new Error(data.error ?? `${service.toUpperCase()} catalog lookup failed with status ${response.status}`);
    }

    return {
      ...data,
      cache: {
        ...(data.cache ?? {}),
        source: `remote-${service}-catalog`,
        region,
      },
      regions: catalogRegions,
    };
  }

  async function getCatalogForService(region: string, service: CalculatorService): Promise<CatalogCacheResult> {
    if (service === "evs") {
      return fetchEvsCatalog(region);
    }

    try {
      return await fetchCatalogFromCache(region);
    } catch {
      return fetchRemoteCatalog(region, service);
    }
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

  async function loadCatalogForRegion(
    region: string,
    preferredResourceCode?: string,
    service: CalculatorService = selectedService,
  ) {
    setCatalogLoading(true);
    setAppError("");

    try {
      const nextRegion = region.trim() || DEFAULT_REGION;
      const normalizedPreferredResourceCode = preferredResourceCode ? normalizeDiskTypeApiCode(preferredResourceCode) : "";
      setCatalogRegion(nextRegion);
      const result = await getCatalogForService(nextRegion, service);
      setCatalogResult(result);
      setCatalogRegions((current) => mergeCatalogRegions(result.regions ?? current, nextRegion));

      if (service === "ecs") {
        const nextFlavors = getCatalogFlavors(result.response.body);
        const preferred = preferredResourceCode
          ? nextFlavors.find((flavor) => flavor.resourceSpecCode === preferredResourceCode)
          : nextFlavors[0];

        if (preferred) {
          setSelectedFlavorCode(preferred.resourceSpecCode);
        }

        return nextFlavors;
      }

      const nextDisks = getCatalogDisks(result.response.body).filter((disk) => (
        DISK_TYPE_OPTIONS.some((option) => option.apiCode === disk.resourceSpecCode)
      ));
      const preferred = normalizedPreferredResourceCode
        ? nextDisks.find((disk) => disk.resourceSpecCode === normalizedPreferredResourceCode)
        : nextDisks.find((disk) => disk.resourceSpecCode === configDiskType) ?? nextDisks[0];

      if (preferred) {
        setConfigDiskType(preferred.resourceSpecCode);
      }

      return nextDisks;
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "Failed to load catalog");
      return [] as Array<ProductFlavor | ProductDisk>;
    } finally {
      setCatalogLoading(false);
    }
  }

  async function buildBulkEcsCalculatorItems() {
    const editTemplate = findTemplate(templates, "edit-cart");
    if (!editTemplate || typeof editTemplate.bodyJson !== "object" || !editTemplate.bodyJson) {
      setAppError("Edit cart template is missing");
      return null;
    }

    const requests = parseBulkEcsRequests(bulkEcsInput);
    const nextRegion = catalogRegion.trim() || DEFAULT_REGION;
    const pricingCatalog = isCatalogLoadedForRegion(catalogResult, nextRegion) && catalogResult
      ? catalogResult
      : await getCatalogForService(nextRegion, "ecs");
    const nextFlavors = getCatalogFlavors(pricingCatalog.response.body);
    const sampleBody = editTemplate.bodyJson as EditCartPayload;
    const sampleItem = sampleBody.cartListData[0];

    if (!sampleItem) {
      throw new Error("Edit cart template does not include a sample ECS item");
    }

    const quantity = Number.parseInt(configQuantity, 10) || 1;
    const durationValue = getNormalizedDurationValue(catalogPricingMode, configHours);
    const diskType = normalizeDiskTypeApiCode(bulkDiskType) || DEFAULT_CATALOG_DISK_TYPE;
    const diskSize = Number.parseInt(bulkDiskSize, 10) || Number.parseInt(DEFAULT_CATALOG_DISK_SIZE, 10);
    const descriptionBase = resolveItemDescription(configDescription, DEFAULT_ECS_DESCRIPTION);
    const disk = getCatalogDisks(pricingCatalog.response.body).find((entry) => entry.resourceSpecCode === diskType);
    if (!disk) {
      throw new Error(`Disk type ${diskType} is unavailable in ${nextRegion}`);
    }
    const matchedItems = requests.map((request) => {
      const flavor = selectCheapestFlavorForRequirements(nextFlavors, {
        pricingMode: catalogPricingMode,
        minVcpus: request.vcpus,
        minRamGb: request.ram,
      });

      if (!flavor) {
        throw new Error(
          `No ${getPricingModeLabel(catalogPricingMode)} ECS in ${nextRegion} matches ${request.name} (${request.vcpus} vCPU / ${request.ram} GB RAM)`,
        );
      }

      const estimate = buildCatalogPriceEstimate(pricingCatalog.response.body, {
        flavorCode: flavor.resourceSpecCode,
        diskType,
        diskSize,
        durationValue,
        quantity,
        pricingMode: catalogPricingMode,
      });

      if (!estimate) {
        throw new Error(
          `Cached ${getPricingModeLabel(catalogPricingMode)} pricing is unavailable for ${flavor.resourceSpecCode} in ${nextRegion}`,
        );
      }

      const description = resolveItemDescription(request.name, descriptionBase);
      const item = buildEcsCalculatorItem(sampleItem, flavor, disk, estimate, {
        region: nextRegion,
        quantity,
        durationValue,
        pricingMode: catalogPricingMode,
        diskType,
        diskSize,
        title: description,
        description,
      });

      return {
        item,
        match: {
          request,
          flavorCode: flavor.resourceSpecCode,
          matchedVcpus: getFlavorCpuCount(flavor),
          matchedRamGb: getFlavorMemoryGb(flavor),
          totalAmount: estimate.amount,
          currency: estimate.currency ?? "USD",
        } satisfies BulkEcsMatch,
      };
    });

    setCatalogResult(pricingCatalog);
    setCatalogRegions((current) => mergeCatalogRegions(pricingCatalog.regions ?? current, nextRegion));
    setCatalogRegion(nextRegion);
    if (matchedItems[0]) {
      setSelectedFlavorCode(matchedItems[0].item.resourceCode);
    }

    return {
      items: matchedItems.map((entry) => entry.item),
      matches: matchedItems.map((entry) => entry.match),
      region: nextRegion,
    };
  }

  async function addBulkMatchesToDraft() {
    setBulkMatchLoading(true);
    setAppError("");

    try {
      const resolved = await buildBulkEcsCalculatorItems();
      if (!resolved) {
        return;
      }

      setCalculatorItems((current) => [...current, ...resolved.items]);
      setBulkMatchResults(resolved.matches);
      setBulkMatchSummary(`Added ${resolved.items.length} matched ECS items to the draft queue.`);
    } catch (error) {
      setBulkMatchResults([]);
      setBulkMatchSummary("");
      setAppError(error instanceof Error ? error.message : "Failed to match the ECS list");
    } finally {
      setBulkMatchLoading(false);
    }
  }

  async function appendBulkMatchesToSelectedCart() {
    if (!selectedCartKey.trim()) {
      setAppError("Select or create a Huawei cart first");
      return;
    }

    setBulkMatchLoading(true);
    setAppError("");

    try {
      const resolved = await buildBulkEcsCalculatorItems();
      if (!resolved) {
        return;
      }

      const detail = currentCartDetail ?? await loadCartDetail(selectedCartKey.trim(), false);
      if (!detail) {
        throw new Error("Load the selected cart before appending ECS matches");
      }

      const nextItems = [
        ...(detail.cartListData ?? []).map((item) => cloneJson(item as CalculatorCartItemPayload)),
        ...resolved.items.map((item) => cloneJson(item.payload)),
      ];

      const result = await updateLiveCartItems(nextItems);
      if (result) {
        setCalculatorItems((current) => [...current, ...resolved.items]);
        setBulkMatchResults(resolved.matches);
        setBulkMatchSummary(`Added ${resolved.items.length} matched ECS items to ${selectedCartName.trim() || "the selected cart"}.`);
      }
    } catch (error) {
      setBulkMatchResults([]);
      setBulkMatchSummary("");
      setAppError(error instanceof Error ? error.message : "Failed to append the ECS list to the selected cart");
    } finally {
      setBulkMatchLoading(false);
    }
  }

  async function buildBulkEvsCalculatorItems() {
    const editTemplate = findTemplate(templates, "edit-cart");
    if (!editTemplate || typeof editTemplate.bodyJson !== "object" || !editTemplate.bodyJson) {
      setAppError("Edit cart template is missing");
      return null;
    }

    const requests = parseBulkEvsRequests(bulkEvsInput);
    const nextRegion = catalogRegion.trim() || DEFAULT_REGION;
    const pricingCatalog = isCatalogLoadedForRegion(catalogResult, nextRegion) && catalogResult
      ? catalogResult
      : await fetchEvsCatalog(nextRegion);
    const sampleBody = editTemplate.bodyJson as EditCartPayload;
    const sampleItem = sampleBody.cartListData[0];

    if (!sampleItem) {
      throw new Error("Edit cart template does not include a sample product item");
    }

    const quantity = Number.parseInt(configQuantity, 10) || 1;
    const durationValue = getNormalizedDurationValue(catalogPricingMode, configHours);
    const defaultType = normalizeDiskTypeApiCode(bulkDiskType) || DEFAULT_CATALOG_DISK_TYPE;
    const descriptionBase = resolveItemDescription(configDescription, DEFAULT_EVS_DESCRIPTION);
    const diskMap = new Map(getCatalogDisks(pricingCatalog.response.body).map((disk) => [disk.resourceSpecCode, disk]));
    const items: CalculatorItem[] = [];
    const matches: BulkEvsMatch[] = [];

    for (const request of requests) {
      const diskType = normalizeDiskTypeApiCode(request.type ?? "") || defaultType;
      const disk = diskMap.get(diskType);
      if (!disk) {
        throw new Error(`Disk type ${diskType} is unavailable in ${nextRegion}`);
      }

      const diskSizes = splitDiskSize(request.size);
      if (!diskSizes.length) {
        throw new Error("Each EVS request must include a positive size");
      }

      let totalAmount = 0;
      for (const [index, chunkSize] of diskSizes.entries()) {
        const estimate = buildCatalogDiskPriceEstimate(pricingCatalog.response.body, {
          diskType,
          diskSize: chunkSize,
          durationValue,
          quantity,
          pricingMode: catalogPricingMode as Exclude<CatalogPricingMode, "RI">,
        });

        if (!estimate) {
          throw new Error(`Cached ${getPricingModeLabel(catalogPricingMode, "evs")} pricing is unavailable for ${diskType} in ${nextRegion}`);
        }

        totalAmount += estimate.amount;
        const description = buildSplitDiskTitle(request.name?.trim() || descriptionBase, index, diskSizes.length);
        items.push(buildEvsCalculatorItem(sampleItem, disk, estimate, {
          region: nextRegion,
          quantity,
          durationValue,
          pricingMode: catalogPricingMode as Exclude<CatalogPricingMode, "RI">,
          diskType,
          diskSize: chunkSize,
          title: description,
          description,
        }));
      }

      matches.push({
        request,
        diskType,
        diskSizes,
        totalAmount,
        currency: "USD",
      });
    }

    setCatalogResult(pricingCatalog);
    setCatalogRegions((current) => mergeCatalogRegions(pricingCatalog.regions ?? current, nextRegion));
    setCatalogRegion(nextRegion);

    return {
      items,
      matches,
      region: nextRegion,
    };
  }

  async function addBulkEvsToDraft() {
    setBulkEvsLoading(true);
    setAppError("");

    try {
      const resolved = await buildBulkEvsCalculatorItems();
      if (!resolved) {
        return;
      }

      setCalculatorItems((current) => [...current, ...resolved.items]);
      setBulkEvsResults(resolved.matches);
      setBulkEvsSummary(`Added ${resolved.items.length} EVS items to the draft queue.`);
    } catch (error) {
      setBulkEvsResults([]);
      setBulkEvsSummary("");
      setAppError(error instanceof Error ? error.message : "Failed to build the EVS list");
    } finally {
      setBulkEvsLoading(false);
    }
  }

  async function appendBulkEvsToSelectedCart() {
    if (!selectedCartKey.trim()) {
      setAppError("Select or create a Huawei cart first");
      return;
    }

    setBulkEvsLoading(true);
    setAppError("");

    try {
      const resolved = await buildBulkEvsCalculatorItems();
      if (!resolved) {
        return;
      }

      const detail = currentCartDetail ?? await loadCartDetail(selectedCartKey.trim(), false);
      if (!detail) {
        throw new Error("Load the selected cart before appending EVS items");
      }

      const nextItems = [
        ...(detail.cartListData ?? []).map((item) => cloneJson(item as CalculatorCartItemPayload)),
        ...resolved.items.map((item) => cloneJson(item.payload)),
      ];

      const result = await updateLiveCartItems(nextItems);
      if (result) {
        setCalculatorItems((current) => [...current, ...resolved.items]);
        setBulkEvsResults(resolved.matches);
        setBulkEvsSummary(`Added ${resolved.items.length} EVS items to ${selectedCartName.trim() || "the selected cart"}.`);
      }
    } catch (error) {
      setBulkEvsResults([]);
      setBulkEvsSummary("");
      setAppError(error instanceof Error ? error.message : "Failed to append the EVS list to the selected cart");
    } finally {
      setBulkEvsLoading(false);
    }
  }

  function populateEditorFromDraftItem(item: CalculatorItem) {
    setSelectedService(item.service);
    setEditorTarget({ kind: "draft", id: item.id });
    setCatalogPricingMode(item.pricingMode);
    setConfigQuantity(String(item.quantity));
    setConfigHours(String(item.hours));
    setConfigDiskType(normalizeDiskTypeApiCode(item.diskType));
    setConfigDiskSize(String(item.diskSize));
    setConfigDescription(item.description || item.title);
    setEstimateResult(null);
    if (item.service === "ecs") {
      setSelectedFlavorCode(item.resourceCode);
      void loadCatalogForRegion(item.region, item.resourceCode, "ecs");
      return;
    }
    void loadCatalogForRegion(item.region, normalizeDiskTypeApiCode(item.diskType), "evs");
  }

  function populateEditorFromRemoteItem(item: RemoteCartItem) {
    setSelectedService(item.service);
    setEditorTarget({ kind: "remote", id: item.id });
    setCatalogPricingMode(item.pricingMode);
    setConfigQuantity(String(item.quantity));
    setConfigHours(String(item.hours));
    setConfigDiskType(normalizeDiskTypeApiCode(item.diskType));
    setConfigDiskSize(String(item.diskSize));
    setConfigDescription(item.description || item.title);
    setEstimateResult(null);
    if (item.service === "ecs") {
      setSelectedFlavorCode(item.resourceCode);
      void loadCatalogForRegion(item.region, item.resourceCode, "ecs");
      return;
    }
    void loadCatalogForRegion(item.region, normalizeDiskTypeApiCode(item.diskType), "evs");
  }

  function cancelEditor() {
    setEditorTarget(null);
  }

  async function createLiveCartWithName(name: string): Promise<string> {
    const template = findTemplate(templates, "create-cart");
    if (!template || typeof template.bodyJson !== "object" || !template.bodyJson) {
      throw new Error("Create cart template is missing");
    }

    const payload = cloneJson(template.bodyJson as Record<string, unknown>);
    payload.name = name.trim() || "Team proposal cart";
    const result = await replayOne("create-cart", {
      bodyRaw: JSON.stringify(payload),
    });
    const key = (result.response.body as { data?: string }).data;
    if (typeof key !== "string" || !key.trim()) {
      throw new Error("Huawei create cart did not return a cart key");
    }

    setPublishResult(result);
    setCartDetailCache((current) => ({
      ...current,
      [key]: {
        billingMode: "cart.shareList.billingModeTotal",
        cartListData: [],
        name: payload.name as string,
        totalPrice: {
          amount: 0,
          originalAmount: 0,
          discountAmount: 0,
        },
      },
    }));

    return key;
  }

  async function submitCartUpdate(key: string, payload: EditCartPayload): Promise<ReplayResult> {
    const template = findTemplate(templates, "edit-cart");
    if (!template || typeof template.bodyJson !== "object" || !template.bodyJson) {
      throw new Error("Edit cart template is missing");
    }

    const result = await replayOne("edit-cart", {
      url: buildCartMutationUrl(template, "update", key),
      bodyRaw: JSON.stringify(payload),
    });

    setPublishResult(result);
    return result;
  }

  async function cloneCartToNewKey(detail: ShareCartDetail, nextName: string): Promise<string> {
    const nextKey = await createLiveCartWithName(nextName);
    const duplicatePayload: EditCartPayload = {
      billingMode: detail.billingMode || "cart.shareList.billingModeTotal",
      cartListData: (detail.cartListData ?? []).map((item) => cloneJson(item as CalculatorCartItemPayload)),
      name: nextName,
      totalPrice: buildCartTotalPrice((detail.cartListData ?? []).map((item) => cloneJson(item as CalculatorCartItemPayload))),
    };

    await submitCartUpdate(nextKey, duplicatePayload);
    setCartDetailCache((current) => ({
      ...current,
      [nextKey]: {
        billingMode: duplicatePayload.billingMode,
        cartListData: duplicatePayload.cartListData,
        name: duplicatePayload.name,
        totalPrice: duplicatePayload.totalPrice,
      },
    }));
    return nextKey;
  }

  async function buildBillingConversionItems(detail: ShareCartDetail, targetPricingMode: "ONDEMAND" | "RI") {
    const items = getRemoteCartItems(detail);
    const catalogs = new Map<string, CatalogCacheResult>();
    const getCatalog = async (region: string, service: CalculatorService) => {
      const key = `${service}:${region}`;
      const cached = catalogs.get(key);
      if (cached) {
        return cached;
      }

      const result = await getCatalogForService(region, service);
      catalogs.set(key, result);
      return result;
    };

    return Promise.all(items.map(async (item) => {
      const description = resolveItemDescription(
        item.description,
        item.service === "ecs" ? item.resourceCode : DEFAULT_EVS_DESCRIPTION,
      );

      if (item.service === "ecs") {
        const catalog = await getCatalog(item.region, "ecs");
        const catalogBody = catalog.response.body;
        const targetDiskType = normalizeDiskTypeApiCode(item.diskType) || DEFAULT_CATALOG_DISK_TYPE;
        const durationValue = getNormalizedDurationValue(targetPricingMode, String(item.hours));
        const targetDisk = getCatalogDisks(catalogBody).find((disk) => disk.resourceSpecCode === targetDiskType);
        if (!targetDisk) {
          throw new Error(`Disk type ${targetDiskType} is unavailable in ${item.region}`);
        }

        const targetFlavors = getCatalogFlavors(catalogBody);
        const currentFlavor = targetFlavors.find((flavor) => (
          flavor.resourceSpecCode === item.resourceCode
          && Number.isFinite(getFlavorBasePrice(flavor, targetPricingMode))
        ));
        const matchedFlavor = currentFlavor ?? selectCheapestFlavorForRequirements(targetFlavors, {
          pricingMode: targetPricingMode,
          minVcpus: item.vcpus,
          minRamGb: item.ramGb,
        });
        if (!matchedFlavor) {
          throw new Error(`No ${getPricingModeLabel(targetPricingMode)} ECS in ${item.region} matches ${item.vcpus} vCPU / ${item.ramGb.toFixed(0)} GB RAM`);
        }

        const estimate = buildCatalogPriceEstimate(catalogBody, {
          flavorCode: matchedFlavor.resourceSpecCode,
          diskType: targetDiskType,
          diskSize: item.diskSize,
          durationValue,
          quantity: item.quantity,
          pricingMode: targetPricingMode,
        });
        if (!estimate) {
          throw new Error(`Cached ${getPricingModeLabel(targetPricingMode)} pricing is unavailable for ${matchedFlavor.resourceSpecCode} in ${item.region}`);
        }

        return buildEcsCalculatorItemPayload(item.payload, matchedFlavor, targetDisk, estimate, {
          region: item.region,
          quantity: item.quantity,
          durationValue,
          pricingMode: targetPricingMode,
          diskType: targetDiskType,
          diskSize: item.diskSize,
          title: description,
          description,
        });
      }

      const catalog = await getCatalog(item.region, "evs");
      const catalogBody = catalog.response.body;
      const targetDiskType = normalizeDiskTypeApiCode(item.diskType) || DEFAULT_CATALOG_DISK_TYPE;
      const targetDisk = getCatalogDisks(catalogBody).find((disk) => disk.resourceSpecCode === targetDiskType);
      if (!targetDisk) {
        throw new Error(`Disk type ${targetDiskType} is unavailable in ${item.region}`);
      }

      const durationValue = getNormalizedDurationValue("ONDEMAND", String(item.hours));
      const estimate = buildCatalogDiskPriceEstimate(catalogBody, {
        diskType: targetDiskType,
        diskSize: item.diskSize,
        durationValue,
        quantity: item.quantity,
        pricingMode: "ONDEMAND",
      });
      if (!estimate) {
        throw new Error(`Cached on-demand EVS pricing is unavailable for ${targetDiskType} in ${item.region}`);
      }

      return buildEvsCalculatorItemPayload(item.payload, targetDisk, estimate, {
        region: item.region,
        quantity: item.quantity,
        durationValue,
        pricingMode: "ONDEMAND",
        diskType: targetDiskType,
        diskSize: item.diskSize,
        title: description,
        description,
      });
    }));
  }

  async function buildRegionConversionItems(detail: ShareCartDetail, targetRegion: string) {
    const items = getRemoteCartItems(detail);
    const ecsCatalog = await getCatalogForService(targetRegion, "ecs");
    const evsCatalog = await getCatalogForService(targetRegion, "evs");
    const ecsCatalogBody = ecsCatalog.response.body;
    const evsCatalogBody = evsCatalog.response.body;

    return Promise.all(items.map(async (item) => {
      const description = resolveItemDescription(
        item.description,
        item.service === "ecs" ? item.resourceCode : DEFAULT_EVS_DESCRIPTION,
      );

      if (item.service === "ecs") {
        const targetDiskType = normalizeDiskTypeApiCode(item.diskType) || DEFAULT_CATALOG_DISK_TYPE;
        const targetDisk = getCatalogDisks(ecsCatalogBody).find((disk) => disk.resourceSpecCode === targetDiskType);
        if (!targetDisk) {
          throw new Error(`Disk type ${targetDiskType} is unavailable in ${targetRegion}`);
        }

        if (item.vcpus <= 0 || item.ramGb <= 0) {
          throw new Error(`Unable to determine the source specs for ${description}. Region conversion requires both vCPU and RAM.`);
        }

        const targetFlavors = getCatalogFlavors(ecsCatalogBody);
        const targetFlavor = selectCheapestFlavorForRequirements(targetFlavors, {
          pricingMode: item.pricingMode,
          minVcpus: item.vcpus,
          minRamGb: item.ramGb,
        });
        if (!targetFlavor) {
          throw new Error(`No ${getPricingModeLabel(item.pricingMode)} ECS in ${targetRegion} matches ${item.vcpus} vCPU / ${item.ramGb.toFixed(0)} GB RAM`);
        }

        const durationValue = getNormalizedDurationValue(item.pricingMode, String(item.hours));
        const estimate = buildCatalogPriceEstimate(ecsCatalogBody, {
          flavorCode: targetFlavor.resourceSpecCode,
          diskType: targetDiskType,
          diskSize: item.diskSize,
          durationValue,
          quantity: item.quantity,
          pricingMode: item.pricingMode,
        });
        if (!estimate) {
          throw new Error(`Cached ${getPricingModeLabel(item.pricingMode)} pricing is unavailable for ${targetFlavor.resourceSpecCode} in ${targetRegion}`);
        }

        return buildEcsCalculatorItemPayload(item.payload, targetFlavor, targetDisk, estimate, {
          region: targetRegion,
          quantity: item.quantity,
          durationValue,
          pricingMode: item.pricingMode,
          diskType: targetDiskType,
          diskSize: item.diskSize,
          title: description,
          description,
        });
      }

      const targetPricingMode = item.pricingMode === "RI" ? "ONDEMAND" : item.pricingMode as Exclude<CatalogPricingMode, "RI">;
      const targetDiskType = normalizeDiskTypeApiCode(item.diskType) || DEFAULT_CATALOG_DISK_TYPE;
      const targetDisk = getCatalogDisks(evsCatalogBody).find((disk) => disk.resourceSpecCode === targetDiskType);
      if (!targetDisk) {
        throw new Error(`Disk type ${targetDiskType} is unavailable in ${targetRegion}`);
      }

      const durationValue = getNormalizedDurationValue(targetPricingMode, String(item.hours));
      const estimate = buildCatalogDiskPriceEstimate(evsCatalogBody, {
        diskType: targetDiskType,
        diskSize: item.diskSize,
        durationValue,
        quantity: item.quantity,
        pricingMode: targetPricingMode,
      });
      if (!estimate) {
        throw new Error(`Cached ${getPricingModeLabel(targetPricingMode, "evs")} pricing is unavailable for ${targetDiskType} in ${targetRegion}`);
      }

      return buildEvsCalculatorItemPayload(item.payload, targetDisk, estimate, {
        region: targetRegion,
        quantity: item.quantity,
        durationValue,
        pricingMode: targetPricingMode,
        diskType: targetDiskType,
        diskSize: item.diskSize,
        title: description,
        description,
      });
    }));
  }

  async function createCart() {
    setCreateCartLoading(true);
    setAppError("");

    try {
      const name = newCartName.trim() || "Team proposal cart";
      const key = await createLiveCartWithName(name);
      await refreshCarts();
      setSelectedCartKey(key);
      setSelectedCartName(name);
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "Failed to create cart");
    } finally {
      setCreateCartLoading(false);
    }
  }

  async function loadCatalog() {
    await loadCatalogForRegion(catalogRegion, selectedService === "ecs" ? selectedFlavorCode : configDiskType, selectedService);
  }

  async function estimatePrice() {
    setEstimateLoading(true);
    setAppError("");

    try {
      const quantity = Number.parseInt(configQuantity, 10) || 1;
      const durationValue = getNormalizedDurationValue(catalogPricingMode, configHours);
      const diskSize = Number.parseInt(configDiskSize, 10) || 40;
      const nextRegion = catalogRegion.trim() || DEFAULT_REGION;
      const pricingCatalog = nextRegion === catalogRegion.trim() && catalogResult
        ? catalogResult
        : await getCatalogForService(nextRegion, selectedService);
      let estimate: PriceResponseBody | null = null;
      let estimateResultPayload: ReplayResult;

      if (selectedService === "ecs") {
        if (!selectedFlavor) {
          throw new Error("Select a flavor before estimating price");
        }
        if (!selectedFlavorSupportsPricingMode) {
          throw new Error(`${selectedFlavor.resourceSpecCode} does not expose ${getPricingModeLabel(catalogPricingMode)} pricing in the cached Huawei catalog`);
        }

        estimate = buildCatalogPriceEstimate(pricingCatalog.response.body, {
          flavorCode: selectedFlavor.resourceSpecCode,
          diskType: normalizeDiskTypeApiCode(configDiskType) || DEFAULT_CATALOG_DISK_TYPE,
          diskSize,
          durationValue,
          quantity,
          pricingMode: catalogPricingMode,
        });
        if (!estimate) {
          throw new Error(`Cached ${getPricingModeLabel(catalogPricingMode)} pricing data is unavailable for ${selectedFlavor.resourceSpecCode} in ${nextRegion}`);
        }

        estimateResultPayload = buildCachedEstimateResult(
          estimate,
          nextRegion,
          selectedFlavor.resourceSpecCode,
          normalizeDiskTypeApiCode(configDiskType) || DEFAULT_CATALOG_DISK_TYPE,
          diskSize,
          durationValue,
          quantity,
          catalogPricingMode,
        );
      } else {
        if (!selectedDisk) {
          throw new Error("Load EVS disk types and select one before estimating price");
        }
        if (!selectedDiskSupportsPricingMode) {
          throw new Error(`${getDiskTypeDisplayName(selectedDisk.resourceSpecCode)} does not expose ${getPricingModeLabel(catalogPricingMode, "evs")} pricing in the EVS catalog for ${nextRegion}`);
        }

        const chunkSizes = splitDiskSize(diskSize);
        const chunkEstimates = chunkSizes.map((chunkSize) => buildCatalogDiskPriceEstimate(pricingCatalog.response.body, {
          diskType: normalizeDiskTypeApiCode(configDiskType) || DEFAULT_CATALOG_DISK_TYPE,
          diskSize: chunkSize,
          durationValue,
          quantity,
          pricingMode: catalogPricingMode as Exclude<CatalogPricingMode, "RI">,
        }));

        if (chunkEstimates.some((entry) => !entry)) {
          throw new Error(`Cached ${getPricingModeLabel(catalogPricingMode, "evs")} pricing data is unavailable for ${getDiskTypeDisplayName(configDiskType)} in ${nextRegion}`);
        }

        estimate = {
          amount: Number(chunkEstimates.reduce((sum, entry) => sum + (entry?.amount ?? 0), 0).toFixed(5)),
          discountAmount: 0,
          originalAmount: Number(chunkEstimates.reduce((sum, entry) => sum + (entry?.originalAmount ?? 0), 0).toFixed(5)),
          currency: chunkEstimates[0]?.currency ?? "USD",
          productRatingResult: chunkEstimates.flatMap((entry) => entry?.productRatingResult ?? []),
        };

        estimateResultPayload = {
          endpoint: {
            id: "cached-disk-price-estimate",
            name: "Cached EVS price estimate",
          },
          request: {
            method: "POST",
            url: `/api/replay?id=get-product-options-and-info&service=evs&region=${encodeURIComponent(nextRegion)}`,
            headers: {},
            bodyRaw: JSON.stringify({
              region: nextRegion,
              diskType: normalizeDiskTypeApiCode(configDiskType) || DEFAULT_CATALOG_DISK_TYPE,
              diskSize,
              durationValue,
              quantity,
              pricingMode: catalogPricingMode,
            }),
            useCapturedAuth: false,
          },
          response: {
            ok: true,
            status: 200,
            statusText: "OK",
            contentType: "application/json",
            durationMs: 0,
            body: estimate,
            rawTextPreview: JSON.stringify(estimate).slice(0, 1200),
          },
          testedAt: new Date().toISOString(),
        };
      }

      setCatalogResult(pricingCatalog);
      setCatalogRegions((current) => mergeCatalogRegions(pricingCatalog.regions ?? current, nextRegion));
      setEstimateResult(estimateResultPayload);
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

    if (!estimateBody) {
      setAppError("Estimate price before adding the item");
      return;
    }

    const sampleBody = editTemplate.bodyJson as EditCartPayload;
    const sampleItem = sampleBody.cartListData[0];
    const quantity = Number.parseInt(configQuantity, 10) || 1;
    const durationValue = getNormalizedDurationValue(catalogPricingMode, configHours);
    const diskSize = Number.parseInt(configDiskSize, 10) || 40;
    const nextRegion = catalogRegion.trim() || DEFAULT_REGION;

    if (selectedService === "ecs") {
      if (!selectedFlavor) {
        setAppError("Select a flavor before adding the item");
        return;
      }

      const disk = getCatalogDisks(catalogResult?.response.body).find((entry) => entry.resourceSpecCode === (normalizeDiskTypeApiCode(configDiskType) || DEFAULT_CATALOG_DISK_TYPE));
      if (!disk) {
        setAppError(`Load the ${getDiskTypeDisplayName(configDiskType)} disk catalog before adding the ECS item`);
        return;
      }

      const item = buildEcsCalculatorItem(sampleItem, selectedFlavor, disk, estimateBody, {
        id: editingDraftItem?.id,
        region: nextRegion,
        quantity,
        durationValue,
        pricingMode: catalogPricingMode,
        diskType: normalizeDiskTypeApiCode(configDiskType) || DEFAULT_CATALOG_DISK_TYPE,
        diskSize,
        title: resolveItemDescription(configDescription, selectedFlavor.resourceSpecCode),
        description: resolveItemDescription(configDescription, selectedFlavor.resourceSpecCode),
      });

      setCalculatorItems((current) => {
        if (!editingDraftItem) {
          return [...current, item];
        }

        return current.map((currentItem) => (currentItem.id === editingDraftItem.id ? item : currentItem));
      });
      setEditorTarget(null);
      return;
    }

    if (!selectedDisk) {
      setAppError("Load EVS disk types before adding the item");
      return;
    }

    const chunkSizes = splitDiskSize(diskSize);
    const items = chunkSizes.map((chunkSize, index) => {
      const chunkEstimate = buildCatalogDiskPriceEstimate(catalogResult?.response.body, {
        diskType: normalizeDiskTypeApiCode(configDiskType) || DEFAULT_CATALOG_DISK_TYPE,
        diskSize: chunkSize,
        durationValue,
        quantity,
        pricingMode: catalogPricingMode as Exclude<CatalogPricingMode, "RI">,
      });
      if (!chunkEstimate) {
        throw new Error(`Unable to build the EVS payload for ${getDiskTypeDisplayName(configDiskType)}`);
      }

      const description = buildSplitDiskTitle(resolveItemDescription(configDescription, DEFAULT_EVS_DESCRIPTION), index, chunkSizes.length);
      return buildEvsCalculatorItem(sampleItem, selectedDisk, chunkEstimate, {
        id: editingDraftItem && chunkSizes.length === 1 ? editingDraftItem.id : undefined,
        region: nextRegion,
        quantity,
        durationValue,
        pricingMode: catalogPricingMode as Exclude<CatalogPricingMode, "RI">,
        diskType: normalizeDiskTypeApiCode(configDiskType) || DEFAULT_CATALOG_DISK_TYPE,
        diskSize: chunkSize,
        title: description,
        description,
      });
    });

    setCalculatorItems((current) => {
      if (!editingDraftItem) {
        return [...current, ...items];
      }

      const nextItems = current.filter((currentItem) => currentItem.id !== editingDraftItem.id);
      const editIndex = current.findIndex((currentItem) => currentItem.id === editingDraftItem.id);
      nextItems.splice(editIndex >= 0 ? editIndex : nextItems.length, 0, ...items);
      return nextItems;
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

      const result = await submitCartUpdate(selectedCartKey.trim(), base);

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

  async function convertSelectedCartBillingMode() {
    const trimmedKey = selectedCartKey.trim();
    if (!trimmedKey) {
      setAppError("Select or create a Huawei cart first");
      return;
    }

    setConversionAction("billing");
    setConversionSummary("");
    setAppError("");

    try {
      const detail = currentCartDetail ?? await loadCartDetail(trimmedKey, false);
      if (!detail) {
        throw new Error("Load the selected cart before converting it");
      }

      const sourceName = detail.name?.trim() || selectedCartName.trim() || "Calculator cart";
      const duplicateName = buildDuplicateCartName(
        sourceName,
        billingConversionMode === "RI" ? "RI ECS" : "Pay-per-use ECS",
      );
      const nextKey = await cloneCartToNewKey(detail, duplicateName);
      const convertedItems = await buildBillingConversionItems(detail, billingConversionMode);
      const nextPayload: EditCartPayload = {
        billingMode: detail.billingMode || "cart.shareList.billingModeTotal",
        cartListData: convertedItems.map((item) => cloneJson(item)),
        name: duplicateName,
        totalPrice: buildCartTotalPrice(convertedItems),
      };

      await submitCartUpdate(nextKey, nextPayload);
      setCartDetailCache((current) => ({
        ...current,
        [nextKey]: {
          billingMode: nextPayload.billingMode,
          cartListData: nextPayload.cartListData,
          name: nextPayload.name,
          totalPrice: nextPayload.totalPrice,
        },
      }));
      await refreshCarts();
      setSelectedCartKey(nextKey);
      setSelectedCartName(duplicateName);
      await loadCartDetail(nextKey, true);
      setConversionSummary(`Created ${duplicateName} by duplicating ${sourceName} and converting ECS items to ${getPricingModeLabel(billingConversionMode)}. EVS stayed on-demand.`);
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "Failed to convert the selected cart billing mode");
    } finally {
      setConversionAction(null);
    }
  }

  async function convertSelectedCartRegion() {
    const trimmedKey = selectedCartKey.trim();
    const targetRegion = regionConversionTarget.trim();
    if (!trimmedKey) {
      setAppError("Select or create a Huawei cart first");
      return;
    }
    if (!targetRegion) {
      setAppError("Choose a target region before converting the cart");
      return;
    }

    setConversionAction("region");
    setConversionSummary("");
    setAppError("");

    try {
      const detail = currentCartDetail ?? await loadCartDetail(trimmedKey, false);
      if (!detail) {
        throw new Error("Load the selected cart before converting it");
      }

      const sourceName = detail.name?.trim() || selectedCartName.trim() || "Calculator cart";
      const regionLabel = regionConversionOptions.find((region) => region.id === targetRegion)?.name ?? targetRegion;
      const duplicateName = buildDuplicateCartName(sourceName, regionLabel);
      const nextKey = await cloneCartToNewKey(detail, duplicateName);
      const convertedItems = await buildRegionConversionItems(detail, targetRegion);
      const nextPayload: EditCartPayload = {
        billingMode: detail.billingMode || "cart.shareList.billingModeTotal",
        cartListData: convertedItems.map((item) => cloneJson(item)),
        name: duplicateName,
        totalPrice: buildCartTotalPrice(convertedItems),
      };

      await submitCartUpdate(nextKey, nextPayload);
      setCartDetailCache((current) => ({
        ...current,
        [nextKey]: {
          billingMode: nextPayload.billingMode,
          cartListData: nextPayload.cartListData,
          name: nextPayload.name,
          totalPrice: nextPayload.totalPrice,
        },
      }));
      await refreshCarts();
      setSelectedCartKey(nextKey);
      setSelectedCartName(duplicateName);
      await loadCartDetail(nextKey, true);
      setConversionSummary(`Created ${duplicateName} by duplicating ${sourceName} and converting all items to ${regionLabel}. ECS flavors were re-matched; EVS kept the same type and size.`);
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "Failed to convert the selected cart region");
    } finally {
      setConversionAction(null);
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

    if (!estimateBody) {
      setAppError("Estimate the updated price before saving the live cart item");
      return;
    }

    const quantity = Number.parseInt(configQuantity, 10) || 1;
    const durationValue = getNormalizedDurationValue(catalogPricingMode, configHours);
    const diskSize = Number.parseInt(configDiskSize, 10) || 40;

    let replacementItems: CalculatorCartItemPayload[] = [];
    if (editingRemoteItem.service === "ecs") {
      if (!selectedFlavor) {
        setAppError("Select a flavor before saving the live cart item");
        return;
      }

      replacementItems = [
        (() => {
          const diskType = normalizeDiskTypeApiCode(configDiskType) || normalizeDiskTypeApiCode(editingRemoteItem.diskType);
          const disk = getCatalogDisks(catalogResult?.response.body).find((entry) => entry.resourceSpecCode === diskType);
          if (!disk) {
            throw new Error(`Load the ${getDiskTypeDisplayName(diskType)} disk catalog before saving the ECS item`);
          }

          return buildEcsCalculatorItemPayload(editingRemoteItem.payload, selectedFlavor, disk, estimateBody, {
            region: catalogRegion.trim() || editingRemoteItem.region,
            quantity,
            durationValue,
            pricingMode: catalogPricingMode,
            diskType,
            diskSize,
            title: resolveItemDescription(configDescription, selectedFlavor.resourceSpecCode),
            description: resolveItemDescription(configDescription, editingRemoteItem.description || selectedFlavor.resourceSpecCode),
          });
        })(),
      ];
    } else {
      if (!selectedDisk) {
        setAppError("Load EVS disk types before saving the live cart item");
        return;
      }

      const chunkSizes = splitDiskSize(diskSize);
      replacementItems = chunkSizes.map((chunkSize, index) => {
        const chunkEstimate = buildCatalogDiskPriceEstimate(catalogResult?.response.body, {
          diskType: normalizeDiskTypeApiCode(configDiskType) || normalizeDiskTypeApiCode(editingRemoteItem.diskType),
          diskSize: chunkSize,
          durationValue,
          quantity,
          pricingMode: catalogPricingMode as Exclude<CatalogPricingMode, "RI">,
        });
        if (!chunkEstimate) {
          throw new Error(`Unable to update ${getDiskTypeDisplayName(configDiskType)}`);
        }

        const description = buildSplitDiskTitle(resolveItemDescription(configDescription, editingRemoteItem.description || DEFAULT_EVS_DESCRIPTION), index, chunkSizes.length);
        return buildEvsCalculatorItemPayload(editingRemoteItem.payload, selectedDisk, chunkEstimate, {
          region: catalogRegion.trim() || editingRemoteItem.region,
          quantity,
          durationValue,
          pricingMode: catalogPricingMode as Exclude<CatalogPricingMode, "RI">,
          diskType: normalizeDiskTypeApiCode(configDiskType) || normalizeDiskTypeApiCode(editingRemoteItem.diskType),
          diskSize: chunkSize,
          title: description,
          description,
        });
      });
    }

    const nextItems = currentCartDetail.cartListData
      .flatMap((item, index) => (
        index === editingRemoteItem.index
          ? replacementItems.map((replacement) => cloneJson(replacement))
          : [cloneJson(item as CalculatorCartItemPayload)]
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
          <div className="mb-5 flex flex-wrap gap-3">
            {serviceOptions.map((service) => (
              <button
                key={service.value}
                className={selectedService === service.value ? "btn btn-primary" : "btn btn-secondary"}
                onClick={() => {
                  setSelectedService(service.value);
                  setEditorTarget(null);
                  setEstimateResult(null);
                  if (service.value === "ecs") {
                    setConfigDescription(DEFAULT_ECS_DESCRIPTION);
                  } else {
                    setConfigDescription(DEFAULT_EVS_DESCRIPTION);
                  }
                }}
                type="button"
              >
                {service.label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="eyebrow">Huawei Cloud Style Calculator</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
                {selectedService === "ecs"
                  ? "Build an ECS proposal, price it, and publish it into a Huawei cart."
                  : "Build EVS disks, price them, and publish them into a Huawei cart."}
              </h1>
              <p className="mt-4 text-base leading-7 text-slate-600">
                {selectedService === "ecs"
                  ? "Choose a target cart, browse flavors, configure compute and disk, estimate cost, stage multiple products, and then write the calculator state into the selected share cart."
                  : "Choose a target cart, pick EVS types and sizes, split oversized disks automatically, stage multiple volumes, and then write the calculator state into the selected share cart."}
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

              <div className="soft-panel mt-4">
                <p className="section-title">Duplicate and convert</p>
                <p className="mt-2 text-sm text-slate-600">
                  Each conversion first duplicates the selected cart, then applies the changes to the duplicated copy.
                </p>

                <label className="label mt-4" htmlFor="billing-conversion-mode">
                  ECS billing conversion
                </label>
                <select
                  className="field"
                  disabled={!selectedCartKey.trim() || conversionAction !== null}
                  id="billing-conversion-mode"
                  onChange={(event) => setBillingConversionMode(event.target.value as "ONDEMAND" | "RI")}
                  value={billingConversionMode}
                >
                  {BILLING_CONVERSION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-slate-500">
                  Only ECS items are converted. EVS items always stay pay-per-use in the duplicated cart.
                </p>
                <button
                  className="btn btn-secondary mt-3 w-full"
                  disabled={!selectedCartKey.trim() || conversionAction !== null || cartDetailLoading}
                  onClick={() => void convertSelectedCartBillingMode()}
                  type="button"
                >
                  {conversionAction === "billing" ? "Converting billing..." : "Duplicate cart and convert ECS billing"}
                </button>

                <label className="label mt-4" htmlFor="region-conversion-target">
                  Region conversion
                </label>
                <select
                  className="field"
                  disabled={!selectedCartKey.trim() || conversionAction !== null}
                  id="region-conversion-target"
                  onChange={(event) => setRegionConversionTarget(event.target.value)}
                  value={regionConversionTarget}
                >
                  {regionConversionOptions.map((region) => (
                    <option key={region.id} value={region.id}>
                      {region.name === region.id ? region.id : `${region.name} (${region.id})`}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-slate-500">
                  Defaults flip between Brazil ({BRAZIL_REGION}) and Santiago ({SANTIAGO_REGION}). ECS items are rematched to the cheapest compatible flavor in the target region.
                </p>
                <button
                  className="btn btn-secondary mt-3 w-full"
                  disabled={!selectedCartKey.trim() || !regionConversionTarget.trim() || conversionAction !== null || cartDetailLoading}
                  onClick={() => void convertSelectedCartRegion()}
                  type="button"
                >
                  {conversionAction === "region" ? "Converting region..." : "Duplicate cart and convert region"}
                </button>

                {conversionSummary ? (
                  <div className="result-strip mt-4">
                    <p className="text-sm font-semibold text-slate-900">{conversionSummary}</p>
                  </div>
                ) : null}
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
                          <p className="mt-1 text-sm text-slate-600">{item.service === "ecs" ? item.resourceCode : formatDiskLabel(item.diskType, item.diskSize)}</p>
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
                        <span className="pill">{item.service.toUpperCase()}</span>
                        <span className="pill">{item.region}</span>
                        <span className="pill">{getPricingModeLabel(item.pricingMode, item.service)}</span>
                        <span className="pill">{item.quantity}x</span>
                        {item.pricingMode === "RI" ? null : <span className="pill">{formatDuration(item.pricingMode, item.hours)}</span>}
                        {item.service === "ecs" ? <span className="pill">{item.diskLabel}</span> : null}
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
                          <p className="mt-1 text-sm text-slate-600">{item.service === "ecs" ? item.resourceCode : formatDiskLabel(item.diskType, item.diskSize)}</p>
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
                        <span className="pill">{item.service.toUpperCase()}</span>
                        <span className="pill">{getPricingModeLabel(item.pricingMode, item.service)}</span>
                        <span className="pill">{item.quantity}x</span>
                        {item.pricingMode === "RI" ? null : <span className="pill">{formatDuration(item.pricingMode, item.hours)}</span>}
                        <span className="pill">{formatDiskLabel(item.diskType, item.diskSize)}</span>
                        <span className="pill">{item.totalAmount.toFixed(2)} {item.currency}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">The selected cart draft is empty. Add products from the calculator panel.</p>
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
                  <h2 className="mt-1 text-2xl font-semibold">
                    {selectedService === "ecs" ? "Browse ECS flavors" : "Browse EVS disk types"}
                  </h2>
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
                      {pricingModeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button className="btn btn-primary" disabled={catalogLoading || loadingTemplates} onClick={() => void loadCatalog()} type="button">
                    {catalogLoading ? "Loading..." : selectedService === "ecs" ? "Load flavors" : "Load disk types"}
                  </button>
                </div>
              </div>

              {selectedService === "ecs" ? (
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
              ) : (
                <div className="mt-5 grid gap-4 lg:grid-cols-3">
                  {DISK_TYPE_OPTIONS.map((option) => {
                    const disk = disks.find((entry) => entry.resourceSpecCode === option.apiCode);
                    const diskPrice = disk ? getDiskBasePrice(disk, catalogPricingMode as Exclude<CatalogPricingMode, "RI">) : Number.POSITIVE_INFINITY;
                    return (
                      <button
                        key={option.apiCode}
                        className={`result-strip text-left ${configDiskType === option.apiCode ? "border-sky-300 bg-sky-50" : ""}`}
                        onClick={() => {
                          setConfigDiskType(option.apiCode);
                          setEstimateResult(null);
                        }}
                        type="button"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900">{option.label}</p>
                            <p className="mt-1 text-xs text-slate-500">{option.apiCode}</p>
                          </div>
                          <span className="pill">
                            {Number.isFinite(diskPrice) ? diskPrice.toFixed(4) : "-"}
                          </span>
                        </div>
                        <p className="mt-3 text-sm text-slate-600">
                          {disk?.productSpecSysDesc || "Load the EVS catalog for region-specific pricing."}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
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
                      <label className="label" htmlFor="config-description">
                        Description
                      </label>
                      <input className="field" id="config-description" onChange={(event) => setConfigDescription(event.target.value)} value={configDescription} />
                    </div>
                    {catalogPricingMode === "RI" ? (
                      <div>
                        <label className="label">RI pricing</label>
                        <div className="field flex min-h-11 items-center bg-slate-50 text-sm text-slate-600">
                          One-time 1-year RI purchase price per instance
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
                        EVS type
                      </label>
                      <select className="field" id="config-disk-type" onChange={(event) => setConfigDiskType(event.target.value)} value={configDiskType}>
                        {configDiskTypeOptions.map((option) => (
                          <option key={option} value={option}>
                            {getDiskTypeDisplayName(option)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor="config-disk-size">
                        EVS size (GB)
                      </label>
                      <input className="field" id="config-disk-size" onChange={(event) => setConfigDiskSize(event.target.value)} value={configDiskSize} />
                      {selectedService === "evs" ? (
                        <p className="mt-2 text-xs text-slate-500">
                          Requests over {MAX_EVS_DISK_SIZE_GB} GB are split into multiple disks automatically.
                        </p>
                      ) : null}
                    </div>
                  </div>

                </div>

                <div className="soft-panel">
                  <p className="section-title">{selectedService === "ecs" ? "Selected flavor" : "Selected EVS type"}</p>
                  {selectedService === "ecs" ? (selectedFlavor ? (
                    <>
                      <p className="mt-3 text-2xl font-semibold text-slate-900">{selectedFlavor.resourceSpecCode}</p>
                      <p className="mt-1 text-sm text-slate-600">{getFlavorLabel(selectedFlavor)}</p>
                      <p className="mt-3 text-sm font-semibold text-slate-900">
                        {getPricingRateLabel(catalogPricingMode)}: {selectedFlavorSupportsPricingMode ? selectedFlavorPrice.toFixed(4) : "-"}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="pill">{getPricingModeLabel(catalogPricingMode, "ecs")}</span>
                        {catalogPricingMode === "RI"
                          ? <span className="pill">Disk pricing excluded</span>
                          : <span className="pill">Disk: {getPricingModeLabel(getEffectiveDiskPricingMode(catalogPricingMode), "ecs")}</span>}
                      </div>
                      {!selectedFlavorSupportsPricingMode ? (
                        <p className="mt-3 text-sm text-amber-700">
                          This flavor does not expose {getPricingModeLabel(catalogPricingMode, "ecs")} pricing in the cached Huawei catalog for {catalogRegion}.
                        </p>
                      ) : null}
                      {catalogPricingMode === "RI" ? (
                        <p className="mt-3 text-sm text-slate-600">
                          RI uses Huawei&apos;s 1-year RI purchase price. Disk pricing is excluded because the cached disk catalog does not expose RI plans.
                        </p>
                      ) : null}
                      <p className="mt-4 text-sm leading-6 text-slate-600">
                        {selectedFlavor.productSpecDesc || selectedFlavor.productSpecSysDesc || "No description available"}
                      </p>
                    </>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">Load the catalog and choose a flavor first.</p>
                  )) : (selectedDisk ? (
                    <>
                      <p className="mt-3 text-2xl font-semibold text-slate-900">{getDiskTypeDisplayName(selectedDisk.resourceSpecCode)}</p>
                      <p className="mt-1 text-sm text-slate-600">{selectedDisk.resourceSpecCode}</p>
                      <p className="mt-3 text-sm font-semibold text-slate-900">
                        {getPricingRateLabel(catalogPricingMode)}: {selectedDiskSupportsPricingMode ? selectedDiskPrice.toFixed(4) : "-"}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="pill">{getPricingModeLabel(catalogPricingMode, "evs")}</span>
                        <span className="pill">Max single disk: {MAX_EVS_DISK_SIZE_GB} GB</span>
                      </div>
                      {!selectedDiskSupportsPricingMode ? (
                        <p className="mt-3 text-sm text-amber-700">
                          This EVS type does not expose {getPricingModeLabel(catalogPricingMode, "evs")} pricing in the EVS catalog for {catalogRegion}.
                        </p>
                      ) : null}
                      <p className="mt-4 text-sm leading-6 text-slate-600">
                        {selectedDisk.productSpecDesc || selectedDisk.productSpecSysDesc || "No description available"}
                      </p>
                    </>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">Load the EVS catalog and choose a disk type first.</p>
                  ))}

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      className="btn btn-primary"
                      disabled={estimateLoading || loadingTemplates || (selectedService === "ecs" ? !selectedFlavor || !selectedFlavorSupportsPricingMode : !selectedDisk || !selectedDiskSupportsPricingMode)}
                      onClick={() => void estimatePrice()}
                      type="button"
                    >
                      {estimateLoading ? "Estimating..." : `Estimate ${getPricingModeLabel(catalogPricingMode, selectedService)} price`}
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

                <div className="soft-panel lg:col-span-2">
                  {selectedService === "ecs" ? (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="section-title">Bulk ECS matcher</p>
                          <p className="mt-2 text-sm text-slate-600">
                            Paste a list of ECS requirements. The calculator picks the cheapest flavor in <code>{catalogRegion}</code>
                            that meets each minimum using {getPricingModeLabel(catalogPricingMode, "ecs")} pricing.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className="pill">Region: {catalogRegion}</span>
                          <span className="pill">Billing: {getPricingModeLabel(catalogPricingMode, "ecs")}</span>
                          <span className="pill">Cart: {selectedCartName || "Unset"}</span>
                        </div>
                      </div>

                      <label className="label mt-4" htmlFor="bulk-ecs-input">
                        ECS list
                      </label>
                      <textarea
                        className="field h-40 font-mono text-sm"
                        id="bulk-ecs-input"
                        onChange={(event) => setBulkEcsInput(event.target.value)}
                        spellCheck={false}
                        value={bulkEcsInput}
                      />

                      <p className="mt-3 text-sm text-slate-500">
                        Uses the current quantity and duration from this step, plus the EVS settings below, for every matched ECS.
                      </p>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="label" htmlFor="bulk-disk-type">
                            EVS type
                          </label>
                          <select className="field" id="bulk-disk-type" onChange={(event) => setBulkDiskType(event.target.value)} value={bulkDiskType}>
                            {bulkDiskTypeOptions.map((option) => (
                              <option key={option} value={option}>
                                {getDiskTypeDisplayName(option)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="label" htmlFor="bulk-disk-size">
                            EVS size (GB)
                          </label>
                          <input className="field" id="bulk-disk-size" onChange={(event) => setBulkDiskSize(event.target.value)} value={bulkDiskSize} />
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-3">
                        <button className="btn btn-primary" disabled={bulkMatchLoading || loadingTemplates} onClick={() => void addBulkMatchesToDraft()} type="button">
                          {bulkMatchLoading ? "Matching..." : "Add matched ECS list to draft"}
                        </button>
                        <button className="btn btn-secondary" disabled={bulkMatchLoading || loadingTemplates || !selectedCartKey.trim()} onClick={() => void appendBulkMatchesToSelectedCart()} type="button">
                          {bulkMatchLoading ? "Matching..." : "Add matched ECS list to selected cart"}
                        </button>
                      </div>

                      {bulkMatchSummary ? (
                        <div className="result-strip mt-4">
                          <p className="font-semibold text-slate-900">{bulkMatchSummary}</p>
                          {bulkMatchResults.length ? (
                            <div className="mt-3 space-y-2">
                              {bulkMatchResults.map((match, index) => (
                                <div key={`${match.request.name}-${match.flavorCode}-${index}`} className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-700">
                                  <span>{match.request.name} - {match.flavorCode} ({match.matchedVcpus} vCPU / {match.matchedRamGb.toFixed(0)} GB)</span>
                                  <span className="pill">{match.totalAmount.toFixed(2)} {match.currency}</span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="section-title">Bulk EVS add</p>
                          <p className="mt-2 text-sm text-slate-600">
                            Paste a list of EVS requests. Each item needs a <code>size</code>, can optionally include <code>name</code>,
                            and can optionally override the EVS type with <code>type</code>.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className="pill">Region: {catalogRegion}</span>
                          <span className="pill">Billing: {getPricingModeLabel(catalogPricingMode, "evs")}</span>
                          <span className="pill">Cart: {selectedCartName || "Unset"}</span>
                        </div>
                      </div>

                      <label className="label mt-4" htmlFor="bulk-evs-input">
                        EVS list
                      </label>
                      <textarea
                        className="field h-40 font-mono text-sm"
                        id="bulk-evs-input"
                        onChange={(event) => setBulkEvsInput(event.target.value)}
                        spellCheck={false}
                        value={bulkEvsInput}
                      />

                      <p className="mt-3 text-sm text-slate-500">
                        Uses the current quantity, duration, and description from this step. Each oversized disk is split automatically.
                      </p>

                      <div className="mt-4">
                        <label className="label" htmlFor="bulk-disk-type">
                          Default EVS type
                        </label>
                        <select className="field" id="bulk-disk-type" onChange={(event) => setBulkDiskType(event.target.value)} value={bulkDiskType}>
                          {bulkDiskTypeOptions.map((option) => (
                            <option key={option} value={option}>
                              {getDiskTypeDisplayName(option)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-3">
                        <button className="btn btn-primary" disabled={bulkEvsLoading || loadingTemplates} onClick={() => void addBulkEvsToDraft()} type="button">
                          {bulkEvsLoading ? "Adding..." : "Add EVS list to draft"}
                        </button>
                        <button className="btn btn-secondary" disabled={bulkEvsLoading || loadingTemplates || !selectedCartKey.trim()} onClick={() => void appendBulkEvsToSelectedCart()} type="button">
                          {bulkEvsLoading ? "Adding..." : "Add EVS list to selected cart"}
                        </button>
                      </div>

                      {bulkEvsSummary ? (
                        <div className="result-strip mt-4">
                          <p className="font-semibold text-slate-900">{bulkEvsSummary}</p>
                          {bulkEvsResults.length ? (
                            <div className="mt-3 space-y-2">
                              {bulkEvsResults.map((match, index) => (
                                <div key={`${match.request.name ?? "evs"}-${match.diskType}-${index}`} className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-700">
                                  <span>{match.request.name?.trim() || "Unnamed EVS"} - {getDiskTypeDisplayName(match.diskType)} ({match.diskSizes.join(" + ")} GB)</span>
                                  <span className="pill">{match.totalAmount.toFixed(2)} {match.currency}</span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  )}
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
