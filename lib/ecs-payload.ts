import { getEffectiveDiskPricingMode, type CatalogPricingMode, type PriceResponseBody, type ProductDisk } from "@/lib/catalog";
import type { ProductFlavor } from "@/lib/catalog";

type PriceRating = NonNullable<PriceResponseBody["productRatingResult"]>[number];

type DiskPlan = NonNullable<ProductDisk["planList"]>[number];

export function getEcsSystemDiskStepperType(disk: ProductDisk, existingDiskInfo: Record<string, unknown>): string {
  if (typeof disk.type === "string" && disk.type.trim()) {
    return disk.type;
  }

  return typeof existingDiskInfo.type === "string" ? existingDiskInfo.type : "";
}

function getEcsSystemDiskPlan(disk: ProductDisk, billingMode: CatalogPricingMode): DiskPlan | null {
  const plans = [...(disk.bakPlanList ?? []), ...(disk.planList ?? [])];
  const matchedPlan = plans.find((plan) => plan.billingMode === billingMode);
  return matchedPlan ? { ...matchedPlan } : null;
}

function replaceDiskAddToListProduct(currentValue: unknown, nextType: string, diskSize: number): string {
  const fallbackSuffix = `${diskSize}BSSUNIT.pluralUnit.17`;
  if (typeof currentValue !== "string" || !currentValue.trim()) {
    return `${nextType} | ${fallbackSuffix}`;
  }

  const parts = currentValue.split("|");
  const suffix = parts.length > 1 ? parts.slice(1).join("|").trim() : fallbackSuffix;
  return `${nextType} | ${suffix}`;
}

export function buildEcsSystemDiskPayload(options: {
  existingDiskInfo: Record<string, unknown>;
  disk: ProductDisk;
  diskSize: number;
  quantity: number;
  durationValue: number;
  pricingMode: CatalogPricingMode;
  diskRating?: PriceRating;
}): Record<string, unknown> {
  const {
    existingDiskInfo,
    disk,
    diskSize,
    quantity,
    durationValue,
    pricingMode,
    diskRating,
  } = options;
  const diskPricingMode = getEffectiveDiskPricingMode(pricingMode);
  const existingInquiry = (existingDiskInfo.inquiryResult as Record<string, unknown> | undefined) ?? {};
  const selectedPlan = getEcsSystemDiskPlan(disk, diskPricingMode);
  const nextType = getEcsSystemDiskStepperType(disk, existingDiskInfo);
  const nextSkuInfo = Array.isArray(existingDiskInfo._skuInfo)
    ? [...existingDiskInfo._skuInfo]
    : Array.isArray(disk._skuInfo)
      ? [...disk._skuInfo]
      : [];

  if (typeof disk.volumeType === "string" && disk.volumeType.trim()) {
    nextSkuInfo[0] = `Disk Specifications: ${disk.volumeType}`;
  }
  if (!nextSkuInfo[1]) {
    nextSkuInfo[1] = "Disk Size: nullBSSUNIT.unit.17";
  }

  return {
    ...existingDiskInfo,
    ...disk,
    resourceSpecCode: disk.resourceSpecCode,
    resourceSpecType: typeof disk.resourceSpecType === "string" && disk.resourceSpecType.trim()
      ? disk.resourceSpecType
      : (typeof existingDiskInfo.resourceSpecType === "string" ? existingDiskInfo.resourceSpecType : disk.resourceSpecCode),
    productSpecSysDesc: typeof disk.productSpecSysDesc === "string" && disk.productSpecSysDesc.trim()
      ? disk.productSpecSysDesc
      : existingDiskInfo.productSpecSysDesc,
    volumeType: typeof disk.volumeType === "string" && disk.volumeType.trim()
      ? disk.volumeType
      : existingDiskInfo.volumeType,
    _skuInfo: nextSkuInfo,
    billingItem: disk.billingItem ?? existingDiskInfo.billingItem,
    type: nextType,
    info: disk.info ?? existingDiskInfo.info,
    specifications: disk.specifications ?? existingDiskInfo.specifications,
    tableUnit: disk.tableUnit ?? existingDiskInfo.tableUnit,
    periodList: disk.periodList ?? existingDiskInfo.periodList,
    resourceSize: diskSize,
    addToList_product: replaceDiskAddToListProduct(existingDiskInfo.addToList_product, nextType, diskSize),
    planList: undefined,
    bakPlanList: selectedPlan ? [selectedPlan] : existingDiskInfo.bakPlanList,
    productId: selectedPlan?.productId ?? disk.productId ?? existingDiskInfo.productId,
    productNum: quantity,
    selfProductNum: quantity,
    billingMode: diskPricingMode,
    siteCode: selectedPlan?.siteCode ?? disk.siteCode ?? existingDiskInfo.siteCode,
    periodNum: selectedPlan?.periodNum ?? disk.periodNum ?? existingDiskInfo.periodNum ?? null,
    billingEvent: selectedPlan?.billingEvent ?? disk.billingEvent ?? existingDiskInfo.billingEvent,
    measureUnitStep: selectedPlan?.measureUnitStep ?? disk.measureUnitStep ?? existingDiskInfo.measureUnitStep,
    measureUnit: selectedPlan?.measureUnit ?? disk.measureUnit ?? existingDiskInfo.measureUnit,
    usageFactor: selectedPlan?.usageFactor ?? disk.usageFactor ?? existingDiskInfo.usageFactor,
    usageMeasureId: selectedPlan?.usageMeasureId ?? disk.usageMeasureId ?? existingDiskInfo.usageMeasureId,
    amount: selectedPlan?.amount ?? (typeof disk.amount === "number" ? disk.amount : existingDiskInfo.amount),
    usageValue: durationValue,
    __hydratedPricingModes: undefined,
    inquiryResult: {
      ...existingInquiry,
      id: diskRating?.id ?? existingInquiry.id,
      productId: diskRating?.productId ?? selectedPlan?.productId ?? disk.productId ?? existingDiskInfo.productId,
      amount: diskRating?.amount ?? selectedPlan?.amount ?? (typeof disk.amount === "number" ? disk.amount : existingDiskInfo.amount),
      discountAmount: diskRating?.discountAmount ?? 0,
      originalAmount: diskRating?.originalAmount
        ?? selectedPlan?.amount
        ?? (typeof disk.amount === "number" ? disk.amount : existingDiskInfo.originalAmount ?? existingDiskInfo.amount),
      perAmount: null,
      perDiscountAmount: null,
      perOriginalAmount: null,
      perPeriodType: null,
      measureId: 1,
      extendParams: null,
    },
  };
}

function getFlavorFamily(flavor: ProductFlavor): string {
  const familySource = [
    typeof flavor.spec === "string" ? flavor.spec : "",
    typeof flavor.riResourceSepc === "string" ? flavor.riResourceSepc : "",
    typeof flavor.resourceSpecCode === "string" ? flavor.resourceSpecCode : "",
  ].find((value) => value.trim());
  const match = familySource?.match(/^([^.]+)/);
  return match?.[1]?.trim() ?? "";
}

function getFlavorDisplaySpec(flavor: ProductFlavor): string {
  if (typeof flavor.spec === "string" && flavor.spec.trim()) {
    return flavor.spec.trim();
  }

  return flavor.resourceSpecCode.replace(/\.(linux|byol)$/i, "");
}

export function buildEcsFlavorAddToListProduct(
  flavor: ProductFlavor,
  existingVmInfo: Record<string, unknown>,
): string | undefined {
  const parts = [
    typeof flavor.arch === "string" && flavor.arch.trim() ? flavor.arch.trim() : null,
    typeof flavor.vmType === "string" && flavor.vmType.trim() ? flavor.vmType.trim() : null,
    getFlavorDisplaySpec(flavor),
    typeof flavor.cpu === "string" && flavor.cpu.trim() ? flavor.cpu.trim() : null,
    typeof flavor.mem === "string" && flavor.mem.trim() ? flavor.mem.trim() : null,
  ].filter((value): value is string => Boolean(value && value.trim()));

  if (parts.length) {
    return parts.join(" | ");
  }

  return typeof existingVmInfo.addToList_product === "string" ? existingVmInfo.addToList_product : undefined;
}

export function buildEcsImagePayload(options: {
  existingImageInfo: Record<string, unknown>;
  flavor: ProductFlavor;
  durationValue: number;
}): Record<string, unknown> {
  const { existingImageInfo, flavor, durationValue } = options;
  const family = getFlavorFamily(flavor);
  const nextTypes = family ? [family] : (
    Array.isArray(existingImageInfo.type)
      ? existingImageInfo.type.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      : []
  );

  return {
    ...existingImageInfo,
    ...(nextTypes.length ? { type: nextTypes } : {}),
    productNum: durationValue,
    durationNum: durationValue,
  };
}
