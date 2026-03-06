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

function getFlavorPlanCount(flavor: ProductFlavor): number {
  return (flavor.planList?.length ?? 0) + (flavor.bakPlanList?.length ?? 0);
}

export function getFlavorBasePrice(flavor: ProductFlavor): number {
  const pricedPlan = [...(flavor.planList ?? []), ...(flavor.bakPlanList ?? [])].find((plan) => (
    typeof plan.amount === "number" && plan.billingMode === "ONDEMAND"
  ));
  if (typeof pricedPlan?.amount === "number") {
    return pricedPlan.amount;
  }

  if (typeof flavor.amount === "number") {
    return flavor.amount;
  }

  const fallbackPlan = [...(flavor.planList ?? []), ...(flavor.bakPlanList ?? [])].find((plan) => typeof plan.amount === "number");
  if (typeof fallbackPlan?.amount === "number") {
    return fallbackPlan.amount;
  }

  if (typeof flavor.inquiryResult?.perAmount === "number") {
    return flavor.inquiryResult.perAmount;
  }

  if (typeof flavor.inquiryResult?.amount === "number") {
    return flavor.inquiryResult.amount;
  }

  return Number.POSITIVE_INFINITY;
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
