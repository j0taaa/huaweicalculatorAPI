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

type CatalogPricedItem = {
  resourceSpecCode: string;
  amount?: number;
  productId?: string;
  planList?: Array<{
    billingMode?: string;
    amount?: number;
  }>;
  bakPlanList?: Array<{
    billingMode?: string;
    amount?: number;
  }>;
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

function getCatalogItemBasePrice(item: CatalogPricedItem): number {
  const pricedPlan = [...(item.planList ?? []), ...(item.bakPlanList ?? [])].find((plan) => (
    typeof plan.amount === "number" && plan.billingMode === "ONDEMAND"
  ));
  if (typeof pricedPlan?.amount === "number") {
    return pricedPlan.amount;
  }

  if (typeof item.amount === "number") {
    return item.amount;
  }

  const fallbackPlan = [...(item.planList ?? []), ...(item.bakPlanList ?? [])].find((plan) => typeof plan.amount === "number");
  if (typeof fallbackPlan?.amount === "number") {
    return fallbackPlan.amount;
  }

  if (typeof item.inquiryResult?.perAmount === "number") {
    return item.inquiryResult.perAmount;
  }

  if (typeof item.inquiryResult?.amount === "number") {
    return item.inquiryResult.amount;
  }

  return Number.POSITIVE_INFINITY;
}

export function getFlavorBasePrice(flavor: ProductFlavor): number {
  return getCatalogItemBasePrice(flavor);
}

export function getDiskBasePrice(disk: ProductDisk): number {
  return getCatalogItemBasePrice(disk);
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
    hours: number;
    quantity: number;
  },
): PriceResponseBody | null {
  const flavor = getCatalogFlavors(body).find((item) => item.resourceSpecCode === config.flavorCode);
  const disk = getCatalogDisks(body).find((item) => item.resourceSpecCode === config.diskType);
  if (!flavor || !disk) {
    return null;
  }

  const flavorRate = getFlavorBasePrice(flavor);
  const diskRate = getDiskBasePrice(disk);
  if (!Number.isFinite(flavorRate) || !Number.isFinite(diskRate)) {
    return null;
  }

  const quantity = Math.max(1, config.quantity);
  const hours = Math.max(1, config.hours);
  const diskSize = Math.max(0, config.diskSize);

  const flavorAmount = roundMoney(flavorRate * quantity * hours);
  const diskAmount = roundMoney(diskRate * diskSize * quantity * hours);
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
