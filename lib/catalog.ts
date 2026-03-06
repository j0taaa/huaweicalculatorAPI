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
    siteCode?: string;
    periodNum?: number | null;
    billingEvent?: string;
    measureUnitStep?: number | null;
    measureUnit?: number | null;
    usageFactor?: string;
    usageMeasureId?: number;
    amount?: number;
  }>;
  bakPlanList?: Array<{
    productId?: string;
    billingMode?: string;
    siteCode?: string;
    periodNum?: number | null;
    billingEvent?: string;
    measureUnitStep?: number | null;
    measureUnit?: number | null;
    usageFactor?: string;
    usageMeasureId?: number;
    amount?: number;
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
    siteCode?: string;
    periodNum?: number | null;
    billingEvent?: string;
    measureUnitStep?: number | null;
    measureUnit?: number | null;
    usageFactor?: string;
    usageMeasureId?: number;
    amount?: number;
  }>;
  bakPlanList?: Array<{
    productId?: string;
    billingMode?: string;
    siteCode?: string;
    periodNum?: number | null;
    billingEvent?: string;
    measureUnitStep?: number | null;
    measureUnit?: number | null;
    usageFactor?: string;
    usageMeasureId?: number;
    amount?: number;
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

function getLowestPlanAmount(plans: CatalogPlan[]): number {
  const amounts = plans
    .map((plan) => plan.amount)
    .filter((amount): amount is number => typeof amount === "number" && Number.isFinite(amount));

  return amounts.length ? Math.min(...amounts) : Number.POSITIVE_INFINITY;
}

function getCatalogItemBasePrice(item: CatalogPricedItem, pricingMode: CatalogPricingMode = "ONDEMAND"): number {
  const matchingPlans = getCatalogPlans(item).filter((plan) => (
    typeof plan.amount === "number" && plan.billingMode === pricingMode
  ));

  if (pricingMode === "RI") {
    const preferredRiPrice = getLowestPlanAmount(matchingPlans.filter((plan) => (
      plan.originType === "perEffectivePrice" || plan.amountType === "nodeData.perEffectivePrice"
    )));
    if (Number.isFinite(preferredRiPrice)) {
      return preferredRiPrice;
    }

    const fallbackRiPrice = getLowestPlanAmount(matchingPlans.filter((plan) => (
      plan.originType === "perPrice" || plan.amountType === "nodeData.perPrice"
    )));
    if (Number.isFinite(fallbackRiPrice)) {
      return fallbackRiPrice;
    }

    const genericRiPrice = getLowestPlanAmount(matchingPlans);
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

  if (pricingMode === "ONDEMAND") {
    const fallbackPlan = getCatalogPlans(item).find((plan) => typeof plan.amount === "number");
    if (typeof fallbackPlan?.amount === "number") {
      return fallbackPlan.amount;
    }
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

export function getDiskBasePrice(disk: ProductDisk, pricingMode: CatalogPricingMode = "ONDEMAND"): number {
  return getCatalogItemBasePrice(disk, pricingMode);
}

export function getEffectiveDiskPricingMode(pricingMode: CatalogPricingMode): CatalogPricingMode {
  return pricingMode === "RI" ? "ONDEMAND" : pricingMode;
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

    if (shouldPreferFlavor(flavor, current)) {
      uniqueFlavors.set(code, flavor);
    }
  }

  return [...uniqueFlavors.values()];
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

  return diskList as ProductDisk[];
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

  const flavorAmount = roundMoney(flavorRate * quantity * durationValue);
  const diskAmount = roundMoney(diskRate * diskSize * quantity * durationValue);
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

export function getCatalogFlavors(body: unknown): ProductFlavor[] {
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

  return dedupeCatalogFlavors(vmList as ProductFlavor[]);
}
