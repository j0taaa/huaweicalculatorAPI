import { getFlavorGeneration, type EcsCalculatorVisibilityConfig } from "@/lib/catalog-config";

export type ProductFlavor = {
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
  planList?: Array<{
    productId?: string;
    billingMode?: string;
    originType?: string;
    amountType?: string;
    siteCode?: string;
    periodNum?: number | null;
    billingEvent?: string;
    measureUnitStep?: number | null;
    measureUnit?: number | null;
    usageFactor?: string;
    usageMeasureId?: number;
    amount?: number;
    [key: string]: unknown;
  }>;
  bakPlanList?: Array<{
    productId?: string;
    billingMode?: string;
    originType?: string;
    amountType?: string;
    siteCode?: string;
    periodNum?: number | null;
    billingEvent?: string;
    measureUnitStep?: number | null;
    measureUnit?: number | null;
    usageFactor?: string;
    usageMeasureId?: number;
    amount?: number;
    [key: string]: unknown;
  }>;
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

export type ProductDisk = {
  resourceSpecCode: string;
  resourceSpecType?: string;
  cloudServiceType?: string;
  resourceType?: string;
  productSpecSysDesc?: string;
  productSpecDesc?: string;
  volumeType?: string;
  billingMode?: string;
  siteCode?: string;
  periodNum?: number | null;
  billingEvent?: string;
  amount?: number;
  productId?: string;
  planList?: Array<{
    productId?: string;
    billingMode?: string;
    originType?: string;
    amountType?: string;
    siteCode?: string;
    periodNum?: number | null;
    billingEvent?: string;
    measureUnitStep?: number | null;
    measureUnit?: number | null;
    usageFactor?: string;
    usageMeasureId?: number;
    amount?: number;
    [key: string]: unknown;
  }>;
  bakPlanList?: Array<{
    productId?: string;
    billingMode?: string;
    originType?: string;
    amountType?: string;
    siteCode?: string;
    periodNum?: number | null;
    billingEvent?: string;
    measureUnitStep?: number | null;
    measureUnit?: number | null;
    usageFactor?: string;
    usageMeasureId?: number;
    amount?: number;
    [key: string]: unknown;
  }>;
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

export type PriceResponseBody = {
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

export type CatalogPricingMode = "ONDEMAND" | "MONTHLY" | "YEARLY" | "RI";

type CatalogPlan = {
  billingMode?: string;
  amount?: number;
  originType?: string;
  amountType?: string;
  productId?: string;
  siteCode?: string;
  periodNum?: number | null;
  billingEvent?: string;
  measureUnitStep?: number | null;
  measureUnit?: number | null;
  usageFactor?: string;
  usageMeasureId?: number;
  [key: string]: unknown;
};

type CatalogPricedItem = {
  resourceSpecCode: string;
  amount?: number;
  productId?: string;
  planList?: CatalogPlan[];
  bakPlanList?: CatalogPlan[];
  inquiryResult?: {
    id?: string;
    productId?: string;
    amount?: number;
    perAmount?: number | null;
  };
};

function getFlavorPlanCount(flavor: ProductFlavor): number {
  return (flavor.planList?.length ?? 0) + (flavor.bakPlanList?.length ?? 0);
}

function getCatalogPlans(item: CatalogPricedItem): CatalogPlan[] {
  return [...(item.planList ?? []), ...(item.bakPlanList ?? [])];
}

function isPresentValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  return true;
}

function countPresentValues(record: Record<string, unknown>): number {
  return Object.values(record).filter(isPresentValue).length;
}

function getCatalogPlanKey(plan: CatalogPlan): string {
  return JSON.stringify([
    plan.billingMode ?? "",
    plan.originType ?? "",
    plan.amountType ?? "",
    plan.productId ?? "",
    plan.siteCode ?? "",
    plan.periodNum ?? "",
    plan.billingEvent ?? "",
    plan.measureUnitStep ?? "",
    plan.measureUnit ?? "",
    plan.usageFactor ?? "",
    plan.usageMeasureId ?? "",
    plan.amount ?? "",
    typeof plan.planId === "string" ? plan.planId : "",
    typeof plan.skuCode === "string" ? plan.skuCode : "",
    typeof plan.paymentType === "string" ? plan.paymentType : "",
    typeof plan.paymentTypeKey === "string" ? plan.paymentTypeKey : "",
  ]);
}

function mergeCatalogPlans(
  primary: CatalogPlan[] | undefined,
  secondary: CatalogPlan[] | undefined,
): CatalogPlan[] | undefined {
  const mergedPlans = [...(primary ?? []), ...(secondary ?? [])];
  if (!mergedPlans.length) {
    return undefined;
  }

  const uniquePlans = new Map<string, CatalogPlan>();
  for (const plan of mergedPlans) {
    const key = getCatalogPlanKey(plan);
    const current = uniquePlans.get(key);
    if (!current || countPresentValues(plan) > countPresentValues(current)) {
      uniquePlans.set(key, plan);
    }
  }

  return [...uniquePlans.values()];
}

function mergeInquiryResult<T extends { [key: string]: unknown }>(
  primary: T | undefined,
  secondary: T | undefined,
): T | undefined {
  if (!primary) {
    return secondary;
  }

  if (!secondary) {
    return primary;
  }

  const merged: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(secondary), ...Object.keys(primary)]);
  for (const key of keys) {
    const primaryValue = primary[key];
    const secondaryValue = secondary[key];
    merged[key] = isPresentValue(primaryValue) ? primaryValue : secondaryValue;
  }

  return merged as T;
}

function mergeCatalogRecords<T extends Record<string, unknown>>(
  primary: T,
  secondary: T,
): T {
  const merged: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(secondary), ...Object.keys(primary)]);

  for (const key of keys) {
    if (key === "planList" || key === "bakPlanList" || key === "inquiryResult") {
      continue;
    }

    const primaryValue = primary[key];
    const secondaryValue = secondary[key];
    merged[key] = isPresentValue(primaryValue) ? primaryValue : secondaryValue;
  }

  return merged as T;
}

function getLowestPlanAmount(plans: CatalogPlan[]): number {
  const amounts = plans
    .map((plan) => plan.amount)
    .filter((amount): amount is number => typeof amount === "number" && Number.isFinite(amount));

  return amounts.length ? Math.min(...amounts) : Number.POSITIVE_INFINITY;
}

function getPreferredRiPrice(plans: CatalogPlan[]): number {
  const preferredRiPrice = getLowestPlanAmount(plans.filter((plan) => (
    plan.originType === "perPrice" || plan.amountType === "nodeData.perPrice"
  )));
  if (Number.isFinite(preferredRiPrice)) {
    return preferredRiPrice;
  }

  const fallbackRiPrice = getLowestPlanAmount(plans.filter((plan) => (
    plan.originType !== "perEffectivePrice" && plan.amountType !== "nodeData.perEffectivePrice"
  )));
  if (Number.isFinite(fallbackRiPrice)) {
    return fallbackRiPrice;
  }

  return getLowestPlanAmount(plans.filter((plan) => (
    plan.originType === "perEffectivePrice" || plan.amountType === "nodeData.perEffectivePrice"
  )));
}

function getCatalogItemBasePrice(item: CatalogPricedItem, pricingMode: CatalogPricingMode = "ONDEMAND"): number {
  const matchingPlans = getCatalogPlans(item).filter((plan) => (
    typeof plan.amount === "number" && plan.billingMode === pricingMode
  ));

  if (pricingMode === "RI") {
    const oneYearRiPlans = matchingPlans.filter((plan) => plan.periodNum === 1);
    const oneYearRiPrice = getPreferredRiPrice(oneYearRiPlans);
    if (Number.isFinite(oneYearRiPrice)) {
      return oneYearRiPrice;
    }

    const genericRiPrice = getPreferredRiPrice(matchingPlans);
    if (Number.isFinite(genericRiPrice)) {
      return genericRiPrice;
    }
  } else {
    const matchedPrice = getLowestPlanAmount(matchingPlans);
    if (Number.isFinite(matchedPrice)) {
      return matchedPrice;
    }
  }

  if (pricingMode === "ONDEMAND" && typeof item.amount === "number") {
    return item.amount;
  }

  if (pricingMode === "ONDEMAND" && typeof item.inquiryResult?.perAmount === "number") {
    return item.inquiryResult.perAmount;
  }

  if (pricingMode === "ONDEMAND" && typeof item.inquiryResult?.amount === "number") {
    return item.inquiryResult.amount;
  }

  return Number.POSITIVE_INFINITY;
}

export function getFlavorBasePrice(flavor: ProductFlavor, pricingMode: CatalogPricingMode = "ONDEMAND"): number {
  return getCatalogItemBasePrice(flavor, pricingMode);
}

function getFlavorSpecsFromResourceCode(resourceSpecCode: string): { vcpus: number; ramGb: number } | null {
  const match = resourceSpecCode.match(/(?:^|\.)(\d+)u\.(\d+(?:\.\d+)?)g(?:\.|$)/i);
  if (!match) {
    return null;
  }

  return {
    vcpus: Number.parseInt(match[1], 10),
    ramGb: Number.parseFloat(match[2]),
  };
}

export function getFlavorCpuCount(flavor: ProductFlavor): number {
  const spec = flavor.productSpecSysDesc ?? "";
  const specMatch = spec.match(/vCPUs:(\d+)CORE/i);
  if (specMatch) {
    return Number.parseInt(specMatch[1], 10);
  }

  const cpuText = flavor.cpu ?? "";
  const cpuMatch = cpuText.match(/(\d+)/);
  if (cpuMatch) {
    return Number.parseInt(cpuMatch[1], 10);
  }

  return getFlavorSpecsFromResourceCode(flavor.resourceSpecCode)?.vcpus ?? 0;
}

export function getFlavorMemoryGb(flavor: ProductFlavor): number {
  const spec = flavor.productSpecSysDesc ?? "";
  const mbMatch = spec.match(/Memory:(\d+)MB/i);
  if (mbMatch) {
    return Number.parseInt(mbMatch[1], 10) / 1024;
  }

  const memText = flavor.mem ?? "";
  const memMatch = memText.match(/(\d+(?:\.\d+)?)/);
  if (memMatch) {
    return Number.parseFloat(memMatch[1]);
  }

  return getFlavorSpecsFromResourceCode(flavor.resourceSpecCode)?.ramGb ?? 0;
}

export function getDiskBasePrice(disk: ProductDisk, pricingMode: CatalogPricingMode = "ONDEMAND"): number {
  return getCatalogItemBasePrice(disk, pricingMode);
}

export function getEffectiveDiskPricingMode(pricingMode: CatalogPricingMode): CatalogPricingMode {
  return pricingMode === "RI" ? "ONDEMAND" : pricingMode;
}

export function selectCheapestFlavorForRequirements(
  flavors: ProductFlavor[],
  requirements: {
    pricingMode: CatalogPricingMode;
    minVcpus: number;
    minRamGb: number;
  },
): ProductFlavor | null {
  const minVcpus = Math.max(0, requirements.minVcpus);
  const minRamGb = Math.max(0, requirements.minRamGb);

  return flavors
    .filter((flavor) => getFlavorCpuCount(flavor) >= minVcpus)
    .filter((flavor) => getFlavorMemoryGb(flavor) >= minRamGb)
    .filter((flavor) => Number.isFinite(getFlavorBasePrice(flavor, requirements.pricingMode)))
    .sort((left, right) => {
      const leftPrice = getFlavorBasePrice(left, requirements.pricingMode);
      const rightPrice = getFlavorBasePrice(right, requirements.pricingMode);
      if (leftPrice !== rightPrice) {
        return leftPrice - rightPrice;
      }

      const leftCpu = getFlavorCpuCount(left);
      const rightCpu = getFlavorCpuCount(right);
      if (leftCpu !== rightCpu) {
        return leftCpu - rightCpu;
      }

      const leftRam = getFlavorMemoryGb(left);
      const rightRam = getFlavorMemoryGb(right);
      if (leftRam !== rightRam) {
        return leftRam - rightRam;
      }

      return left.resourceSpecCode.localeCompare(right.resourceSpecCode);
    })[0] ?? null;
}

function shouldPreferFlavor(candidate: ProductFlavor, current: ProductFlavor): boolean {
  const candidatePrice = getFlavorBasePrice(candidate);
  const currentPrice = getFlavorBasePrice(current);

  if (Number.isFinite(candidatePrice) && !Number.isFinite(currentPrice)) {
    return true;
  }

  if (Number.isFinite(candidatePrice) && Number.isFinite(currentPrice) && candidatePrice < currentPrice) {
    return true;
  }

  if (candidatePrice === currentPrice && getFlavorPlanCount(candidate) > getFlavorPlanCount(current)) {
    return true;
  }

  return false;
}

export function dedupeCatalogFlavors(flavors: ProductFlavor[]): ProductFlavor[] {
  const uniqueFlavors = new Map<string, ProductFlavor>();

  for (const flavor of flavors) {
    const code = typeof flavor.resourceSpecCode === "string" ? flavor.resourceSpecCode.trim() : "";
    if (!code) {
      continue;
    }

    const current = uniqueFlavors.get(code);
    if (!current) {
      uniqueFlavors.set(code, flavor);
      continue;
    }

    const preferred = shouldPreferFlavor(flavor, current) ? flavor : current;
    const fallback = preferred === flavor ? current : flavor;
    const merged = mergeCatalogRecords(preferred, fallback);
    merged.planList = mergeCatalogPlans(preferred.planList, fallback.planList);
    merged.bakPlanList = mergeCatalogPlans(preferred.bakPlanList, fallback.bakPlanList);
    merged.inquiryResult = mergeInquiryResult(preferred.inquiryResult, fallback.inquiryResult);
    uniqueFlavors.set(code, merged);
  }

  return [...uniqueFlavors.values()];
}

function shouldPreferDisk(candidate: ProductDisk, current: ProductDisk): boolean {
  const candidatePrice = getDiskBasePrice(candidate);
  const currentPrice = getDiskBasePrice(current);

  if (Number.isFinite(candidatePrice) && !Number.isFinite(currentPrice)) {
    return true;
  }

  if (Number.isFinite(candidatePrice) && Number.isFinite(currentPrice) && candidatePrice < currentPrice) {
    return true;
  }

  return false;
}

export function dedupeCatalogDisks(disks: ProductDisk[]): ProductDisk[] {
  const uniqueDisks = new Map<string, ProductDisk>();

  for (const disk of disks) {
    const code = typeof disk.resourceSpecCode === "string" ? disk.resourceSpecCode.trim() : "";
    if (!code) {
      continue;
    }

    const current = uniqueDisks.get(code);
    if (!current) {
      uniqueDisks.set(code, disk);
      continue;
    }

    const preferred = shouldPreferDisk(disk, current) ? disk : current;
    const fallback = preferred === disk ? current : disk;
    const merged = mergeCatalogRecords(preferred, fallback);
    merged.planList = mergeCatalogPlans(preferred.planList, fallback.planList);
    merged.bakPlanList = mergeCatalogPlans(preferred.bakPlanList, fallback.bakPlanList);
    merged.inquiryResult = mergeInquiryResult(preferred.inquiryResult, fallback.inquiryResult);
    uniqueDisks.set(code, merged);
  }

  return [...uniqueDisks.values()];
}

export function getCatalogDisks(body: unknown): ProductDisk[] {
  if (!body || typeof body !== "object") {
    return [];
  }

  const product = (body as { product?: Record<string, unknown> }).product;
  if (!product || typeof product !== "object") {
    return [];
  }

  const diskList = product.ebs_volume;
  if (!Array.isArray(diskList)) {
    return [];
  }

  return dedupeCatalogDisks(diskList as ProductDisk[]);
}

function roundMoney(value: number): number {
  return Number(value.toFixed(5));
}

export function buildCatalogPriceEstimate(
  body: unknown,
  config: {
    flavorCode: string;
    diskType: string;
    diskSize: number;
    durationValue: number;
    quantity: number;
    pricingMode: CatalogPricingMode;
  },
): PriceResponseBody | null {
  const flavor = getCatalogFlavors(body).find((item) => item.resourceSpecCode === config.flavorCode);
  const disk = getCatalogDisks(body).find((item) => item.resourceSpecCode === config.diskType);
  if (!flavor || !disk) {
    return null;
  }

  const flavorRate = getFlavorBasePrice(flavor, config.pricingMode);
  const diskRate = getDiskBasePrice(disk, getEffectiveDiskPricingMode(config.pricingMode));
  if (!Number.isFinite(flavorRate) || !Number.isFinite(diskRate)) {
    return null;
  }

  const quantity = Math.max(1, config.quantity);
  const durationValue = Math.max(1, config.durationValue);
  const diskSize = Math.max(0, config.diskSize);
  const isReservedInstance = config.pricingMode === "RI";
  const flavorAmount = roundMoney(flavorRate * quantity * (isReservedInstance ? 1 : durationValue));
  const diskAmount = roundMoney(isReservedInstance ? 0 : diskRate * diskSize * quantity * durationValue);
  const totalAmount = roundMoney(flavorAmount + diskAmount);

  return {
    amount: totalAmount,
    discountAmount: 0,
    originalAmount: totalAmount,
    currency: "USD",
    productRatingResult: [
      {
        id: flavor.inquiryResult?.id ?? `cached-vm-${flavor.productId ?? flavor.resourceSpecCode}`,
        productId: flavor.productId ?? flavor.inquiryResult?.productId,
        amount: flavorAmount,
        discountAmount: 0,
        originalAmount: flavorAmount,
      },
      {
        id: disk.inquiryResult?.id ?? `cached-disk-${disk.productId ?? disk.resourceSpecCode}`,
        productId: disk.productId ?? disk.inquiryResult?.productId,
        amount: diskAmount,
        discountAmount: 0,
        originalAmount: diskAmount,
      },
    ],
  };
}

export function buildCatalogDiskPriceEstimate(
  body: unknown,
  config: {
    diskType: string;
    diskSize: number;
    durationValue: number;
    quantity: number;
    pricingMode: Exclude<CatalogPricingMode, "RI">;
  },
): PriceResponseBody | null {
  const disk = getCatalogDisks(body).find((item) => item.resourceSpecCode === config.diskType);
  if (!disk) {
    return null;
  }

  const diskRate = getDiskBasePrice(disk, config.pricingMode);
  if (!Number.isFinite(diskRate)) {
    return null;
  }

  const quantity = Math.max(1, config.quantity);
  const durationValue = Math.max(1, config.durationValue);
  const diskSize = Math.max(0, config.diskSize);
  const diskAmount = roundMoney(diskRate * diskSize * quantity * durationValue);

  return {
    amount: diskAmount,
    discountAmount: 0,
    originalAmount: diskAmount,
    currency: "USD",
    productRatingResult: [
      {
        id: disk.inquiryResult?.id ?? `cached-disk-${disk.productId ?? disk.resourceSpecCode}`,
        productId: disk.productId ?? disk.inquiryResult?.productId,
        amount: diskAmount,
        discountAmount: 0,
        originalAmount: diskAmount,
      },
    ],
  };
}

export function isCatalogFlavorVisible(
  flavor: ProductFlavor,
  visibilityConfig?: EcsCalculatorVisibilityConfig | null,
): boolean {
  const flavorType = typeof flavor.type === "string" ? flavor.type.trim().toLowerCase() : "";
  if (flavorType === "hidden") {
    return false;
  }

  const sysDesc = `${flavor.productSpecSysDesc ?? ""} ${flavor.productSpecDesc ?? ""}`.toLowerCase();
  if (sysDesc.includes("remark:hidden")) {
    return false;
  }

  const allowedGenerations = visibilityConfig?.allowedGenerations ?? [];
  if (allowedGenerations.length) {
    const generation = getFlavorGeneration(flavor);
    if (generation && !allowedGenerations.includes(generation)) {
      return false;
    }
  }

  return true;
}

export function getCatalogFlavors(
  body: unknown,
  visibilityConfig?: EcsCalculatorVisibilityConfig | null,
): ProductFlavor[] {
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

  return dedupeCatalogFlavors(vmList as ProductFlavor[]).filter((flavor) => isCatalogFlavorVisible(flavor, visibilityConfig));
}
