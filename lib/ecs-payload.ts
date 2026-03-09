import { getEffectiveDiskPricingMode, type CatalogPricingMode, type PriceResponseBody, type ProductDisk } from "@/lib/catalog";

type PriceRating = NonNullable<PriceResponseBody["productRatingResult"]>[number];

export function getEcsSystemDiskStepperType(disk: ProductDisk, existingDiskInfo: Record<string, unknown>): string {
  if (typeof disk.type === "string" && disk.type.trim()) {
    return disk.type;
  }

  return typeof existingDiskInfo.type === "string" ? existingDiskInfo.type : "";
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
    type: getEcsSystemDiskStepperType(disk, existingDiskInfo),
    resourceSize: diskSize,
    productNum: quantity,
    selfProductNum: quantity,
    billingMode: diskPricingMode,
    usageValue: durationValue,
    inquiryResult: {
      ...existingInquiry,
      id: diskRating?.id ?? existingInquiry.id,
      productId: diskRating?.productId ?? disk.productId ?? existingDiskInfo.productId,
      amount: diskRating?.amount ?? (typeof disk.amount === "number" ? disk.amount : existingDiskInfo.amount),
      discountAmount: diskRating?.discountAmount ?? 0,
      originalAmount: diskRating?.originalAmount
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
