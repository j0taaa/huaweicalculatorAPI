import { getEffectiveDiskPricingMode, type CatalogPricingMode, type PriceResponseBody, type ProductDisk, type ProductFlavor } from "@/lib/catalog";

type PriceRating = NonNullable<PriceResponseBody["productRatingResult"]>[number];

type DiskPlan = NonNullable<ProductDisk["planList"]>[number];
type FlavorPlan = NonNullable<ProductFlavor["planList"]>[number];

const RI_PAYMENT_TYPE = "nodeData.NO_UPFRONT";
const RI_PAYMENT_TYPE_KEY = "NO_UPFRONT";
const RI_TIME_TOKEN = "nodeData.1_3";
const RI_TYPE = "nodeData.STANDARD";
const RI_MONTHLY_HOURS = 730;
const RI_YEARLY_HOURS = 8760;
const RI_INSTALLMENTS = 12;
const RI_INSTALL_PERIOD_TYPE = 2;
const HUAWEI_HOUR_USAGE_MEASURE_ID = 4;

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

function getFlavorDisplaySpec(flavor: ProductFlavor): string {
  if (typeof flavor.spec === "string" && flavor.spec.trim()) {
    return flavor.spec.trim();
  }

  return flavor.resourceSpecCode.replace(/\.(linux|byol)$/i, "");
}

function getRiPlanGroupKey(plan: FlavorPlan): string {
  return JSON.stringify([
    typeof plan.productId === "string" ? plan.productId : "",
    typeof plan.skuCode === "string" ? plan.skuCode : "",
    typeof plan.planId === "string" ? plan.planId : "",
    typeof plan.paymentTypeKey === "string" ? plan.paymentTypeKey : "",
    typeof plan.paymentType === "string" ? plan.paymentType : "",
  ]);
}

function getRiPlanAmount(group: FlavorPlan[], originType: string): number | null {
  const plan = group.find((entry) => entry.originType === originType && typeof entry.amount === "number" && Number.isFinite(entry.amount));
  return typeof plan?.amount === "number" ? plan.amount : null;
}

function sortRiPlans(plans: FlavorPlan[]): FlavorPlan[] {
  const order = new Map<string, number>([
    ["price", 0],
    ["perEffectivePrice", 1],
    ["perPrice", 2],
  ]);

  return [...plans].sort((left, right) => (
    (order.get(typeof left.originType === "string" ? left.originType : "") ?? 99)
    - (order.get(typeof right.originType === "string" ? right.originType : "") ?? 99)
  ));
}

type SelectedRiPlanGroup = {
  plans: FlavorPlan[];
  price: number;
  perEffectivePrice: number | null;
  perPrice: number;
  productId?: string;
  skuCode?: string;
  planId?: string;
  paymentType: string;
  paymentTypeKey: string;
  siteCode?: string;
};

export function getSelectedFlavorRiPlanGroup(flavor: ProductFlavor): SelectedRiPlanGroup | null {
  const nativeRiPlans = [...(flavor.planList ?? []), ...(flavor.bakPlanList ?? [])].filter((plan) => (
    plan.billingMode === "RI"
    && plan.source !== "price_api"
    && typeof plan.amount === "number"
    && Number.isFinite(plan.amount)
  ));

  if (!nativeRiPlans.length) {
    return null;
  }

  const groupedPlans = new Map<string, FlavorPlan[]>();
  for (const plan of nativeRiPlans) {
    const key = getRiPlanGroupKey(plan);
    const current = groupedPlans.get(key) ?? [];
    current.push(plan);
    groupedPlans.set(key, current);
  }

  const groups = [...groupedPlans.values()]
    .map((plans) => {
      const perPrice = getRiPlanAmount(plans, "perPrice");
      if (perPrice === null) {
        return null;
      }

      const explicitPeriodNum = plans.find((plan) => typeof plan.periodNum === "number" && Number.isFinite(plan.periodNum))?.periodNum ?? null;
      const reference = plans[0];
      return {
        plans: sortRiPlans(plans),
        explicitPeriodNum,
        price: getRiPlanAmount(plans, "price") ?? 0,
        perEffectivePrice: getRiPlanAmount(plans, "perEffectivePrice"),
        perPrice,
        productId: typeof reference.productId === "string" ? reference.productId : undefined,
        skuCode: typeof reference.skuCode === "string" ? reference.skuCode : undefined,
        planId: typeof reference.planId === "string" ? reference.planId : undefined,
        paymentType: typeof reference.paymentType === "string" && reference.paymentType.trim()
          ? reference.paymentType
          : RI_PAYMENT_TYPE,
        paymentTypeKey: typeof reference.paymentTypeKey === "string" && reference.paymentTypeKey.trim()
          ? reference.paymentTypeKey
          : RI_PAYMENT_TYPE_KEY,
        siteCode: typeof reference.siteCode === "string" ? reference.siteCode : undefined,
      };
    })
    .filter((group): group is NonNullable<typeof group> => Boolean(group));

  if (!groups.length) {
    return null;
  }

  const preferredPaymentKey = groups.some((group) => group.paymentTypeKey === RI_PAYMENT_TYPE_KEY)
    ? RI_PAYMENT_TYPE_KEY
    : null;
  const paymentFiltered = preferredPaymentKey
    ? groups.filter((group) => group.paymentTypeKey === preferredPaymentKey)
    : groups;

  const explicitOneYear = paymentFiltered
    .filter((group) => group.explicitPeriodNum === 1)
    .sort((left, right) => right.perPrice - left.perPrice);
  if (explicitOneYear.length) {
    return explicitOneYear[0];
  }

  const untypedGroups = paymentFiltered
    .filter((group) => group.explicitPeriodNum === null)
    .sort((left, right) => right.perPrice - left.perPrice);
  if (untypedGroups.length) {
    return untypedGroups[0];
  }

  return null;
}

function buildRiAddToListProduct(baseLabel: string | undefined, paymentType: string): string | undefined {
  if (!baseLabel?.trim()) {
    return baseLabel;
  }

  const parts = baseLabel.split("|").map((part) => part.trim()).filter(Boolean);
  const filtered = parts.filter((part) => part !== RI_PAYMENT_TYPE && part !== RI_TIME_TOKEN);
  filtered.push(paymentType, RI_TIME_TOKEN);
  return filtered.join(" | ");
}

function buildRiImageInquiryResult(existingInquiry: Record<string, unknown> | undefined) {
  return {
    ...(existingInquiry ?? {}),
    amount: 0,
    originalAmount: 0,
    discountAmount: 0,
    installNum: RI_INSTALLMENTS,
    perAmount: 0,
    perDiscountAmount: 0,
    perOriginalAmount: 0,
    installAmount: 0,
    installPeriodType: RI_INSTALL_PERIOD_TYPE,
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

export function buildEcsBuyUrl(options: {
  baseUrl: string;
  region: string;
  flavor: ProductFlavor;
  diskType: string;
  diskSize: number;
  quantity: number;
  pricingMode: CatalogPricingMode;
}): string {
  const { baseUrl, region, flavor, diskType, diskSize, quantity, pricingMode } = options;
  const url = new URL(baseUrl);
  url.searchParams.set("region", region);

  if (pricingMode === "RI") {
    for (const param of ["charging", "flavor", "imageId", "sysdisk", "datadisk", "iptype", "ipcharging", "bwsize", "vmcount", "period"]) {
      url.searchParams.delete(param);
    }
    url.hash = "#/ecs/createRi";
    return url.toString();
  }

  url.searchParams.set("flavor", getFlavorDisplaySpec(flavor));
  url.searchParams.set("sysdisk", `${diskType}:${diskSize}`);
  url.searchParams.set("vmcount", String(quantity));
  url.hash = "#/ecs/createVm";
  return url.toString();
}

export function buildEcsVmPayload(options: {
  existingVmInfo: Record<string, unknown>;
  flavor: ProductFlavor;
  quantity: number;
  durationValue: number;
  pricingMode: CatalogPricingMode;
  vmRating?: PriceRating;
}): Record<string, unknown> {
  const { existingVmInfo, flavor, quantity, durationValue, pricingMode, vmRating } = options;
  const existingInquiry = (existingVmInfo.inquiryResult as Record<string, unknown> | undefined) ?? {};
  const baseAddToListProduct = buildEcsFlavorAddToListProduct(flavor, existingVmInfo);

  if (pricingMode === "RI") {
    const riPlanGroup = getSelectedFlavorRiPlanGroup(flavor);
    if (!riPlanGroup) {
      throw new Error(`Missing native 1-year RI plan metadata for ${flavor.resourceSpecCode}`);
    }

    const vmAnnualTotal = vmRating?.amount ?? Number((riPlanGroup.perPrice * quantity * RI_INSTALLMENTS).toFixed(5));
    const vmMonthlyTotal = Number((riPlanGroup.perPrice * quantity).toFixed(5));
    return {
      ...existingVmInfo,
      ...flavor,
      resourceType: flavor.resourceType ?? existingVmInfo.resourceType,
      cloudServiceType: flavor.cloudServiceType ?? existingVmInfo.cloudServiceType,
      resourceSpecCode: flavor.resourceSpecCode,
      productSpecSysDesc: flavor.productSpecSysDesc ?? existingVmInfo.productSpecSysDesc,
      addToList_product: buildRiAddToListProduct(baseAddToListProduct, riPlanGroup.paymentType),
      productNum: quantity,
      selfProductNum: typeof existingVmInfo.selfProductNum === "number" ? existingVmInfo.selfProductNum : 1,
      billingMode: "RI",
      siteCode: riPlanGroup.siteCode ?? flavor.siteCode ?? existingVmInfo.siteCode,
      periodList: flavor.periodList ?? existingVmInfo.periodList ?? 2,
      RITime: RI_TIME_TOKEN,
      RIType: RI_TYPE,
      paymentType: riPlanGroup.paymentType,
      productId: riPlanGroup.productId ?? flavor.productId ?? existingVmInfo.productId,
      skuCode: riPlanGroup.skuCode ?? (typeof existingVmInfo.skuCode === "string" ? existingVmInfo.skuCode : undefined),
      planId: riPlanGroup.planId ?? (typeof existingVmInfo.planId === "string" ? existingVmInfo.planId : undefined),
      price: riPlanGroup.price,
      perEffectivePrice: riPlanGroup.perEffectivePrice,
      perPrice: riPlanGroup.perPrice,
      bakPlanList: riPlanGroup.plans,
      planList: undefined,
      inquiryTag: typeof existingVmInfo.inquiryTag === "string" ? existingVmInfo.inquiryTag : "normal",
      usageValue: undefined,
      amount: undefined,
      usageMeasureId: undefined,
      measureUnit: undefined,
      measureUnitStep: undefined,
      usageFactor: undefined,
      billingEvent: undefined,
      periodNum: undefined,
      inquiryResult: {
        ...existingInquiry,
        id: vmRating?.id ?? existingInquiry.id,
        productId: vmRating?.productId ?? riPlanGroup.productId ?? flavor.productId ?? existingVmInfo.productId,
        amount: vmAnnualTotal,
        discountAmount: vmRating?.discountAmount ?? 0,
        originalAmount: vmRating?.originalAmount ?? vmAnnualTotal,
        installNum: RI_INSTALLMENTS,
        perAmount: vmMonthlyTotal,
        perDiscountAmount: 0,
        perOriginalAmount: 0,
        installAmount: 0,
        installPeriodType: RI_INSTALL_PERIOD_TYPE,
      },
    };
  }

  return {
    ...existingVmInfo,
    ...flavor,
    resourceType: flavor.resourceType ?? existingVmInfo.resourceType,
    cloudServiceType: flavor.cloudServiceType ?? existingVmInfo.cloudServiceType,
    resourceSpecCode: flavor.resourceSpecCode,
    productSpecSysDesc: flavor.productSpecSysDesc ?? existingVmInfo.productSpecSysDesc,
    addToList_product: baseAddToListProduct,
    productNum: quantity,
    selfProductNum: quantity,
    billingMode: pricingMode,
    usageValue: durationValue,
    inquiryResult: {
      ...existingInquiry,
      id: vmRating?.id ?? existingInquiry.id,
      productId: vmRating?.productId ?? flavor.productId ?? existingVmInfo.productId,
      amount: vmRating?.amount ?? existingVmInfo.amount,
      discountAmount: vmRating?.discountAmount ?? 0,
      originalAmount: vmRating?.originalAmount ?? existingVmInfo.originalAmount ?? existingVmInfo.amount,
      perAmount: null,
      perDiscountAmount: null,
      perOriginalAmount: null,
      perPeriodType: null,
      measureId: 1,
      extendParams: null,
    },
  };
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

  if (pricingMode === "RI") {
    const normalizedRiPlan = selectedPlan
      ? {
          ...selectedPlan,
          usageMeasureId: HUAWEI_HOUR_USAGE_MEASURE_ID,
        }
      : null;
    const diskMonthlyTotal = selectedPlan
      ? Number(((selectedPlan.amount ?? 0) * diskSize * quantity * RI_MONTHLY_HOURS).toFixed(5))
      : 0;
    const diskAnnualTotal = diskRating?.amount
      ?? (selectedPlan ? Number(((selectedPlan.amount ?? 0) * diskSize * quantity * RI_YEARLY_HOURS).toFixed(5)) : 0);

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
      bakPlanList: normalizedRiPlan ? [normalizedRiPlan] : existingDiskInfo.bakPlanList,
      productId: normalizedRiPlan?.productId ?? disk.productId ?? existingDiskInfo.productId,
      productNum: quantity,
      selfProductNum: typeof existingDiskInfo.selfProductNum === "number" ? existingDiskInfo.selfProductNum : 1,
      billingMode: "ONDEMAND",
      inquiryTag: "combine",
      siteCode: normalizedRiPlan?.siteCode ?? disk.siteCode ?? existingDiskInfo.siteCode,
      periodNum: normalizedRiPlan?.periodNum ?? disk.periodNum ?? existingDiskInfo.periodNum ?? null,
      billingEvent: normalizedRiPlan?.billingEvent ?? disk.billingEvent ?? existingDiskInfo.billingEvent,
      measureUnitStep: normalizedRiPlan?.measureUnitStep ?? disk.measureUnitStep ?? existingDiskInfo.measureUnitStep,
      measureUnit: normalizedRiPlan?.measureUnit ?? disk.measureUnit ?? existingDiskInfo.measureUnit,
      usageFactor: normalizedRiPlan?.usageFactor ?? disk.usageFactor ?? existingDiskInfo.usageFactor,
      usageMeasureId: HUAWEI_HOUR_USAGE_MEASURE_ID,
      amount: normalizedRiPlan?.amount ?? (typeof disk.amount === "number" ? disk.amount : existingDiskInfo.amount),
      usageValue: RI_MONTHLY_HOURS,
      cpqPurchaseDuration: RI_YEARLY_HOURS,
      __hydratedPricingModes: undefined,
      inquiryResult: {
        ...existingInquiry,
        id: diskRating?.id ?? existingInquiry.id,
        productId: diskRating?.productId ?? normalizedRiPlan?.productId ?? disk.productId ?? existingDiskInfo.productId,
        amount: diskAnnualTotal,
        discountAmount: diskRating?.discountAmount ?? 0,
        originalAmount: diskRating?.originalAmount ?? diskAnnualTotal,
        perAmount: diskMonthlyTotal,
        perDiscountAmount: 0,
        perOriginalAmount: 0,
        perPeriodType: null,
        measureId: 1,
        extendParams: null,
      },
    };
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
  pricingMode?: CatalogPricingMode;
  quantity?: number;
}): Record<string, unknown> {
  const { existingImageInfo, flavor, durationValue, pricingMode = "ONDEMAND", quantity = 1 } = options;
  const family = getFlavorFamily(flavor);
  const nextTypes = family ? [family] : (
    Array.isArray(existingImageInfo.type)
      ? existingImageInfo.type.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      : []
  );
  const existingInquiry = (existingImageInfo.inquiryResult as Record<string, unknown> | undefined) ?? undefined;

  if (pricingMode === "RI") {
    return {
      ...existingImageInfo,
      ...(nextTypes.length ? { type: nextTypes } : {}),
      productNum: quantity,
      durationNum: undefined,
      inquiryResult: buildRiImageInquiryResult(existingInquiry),
    };
  }

  return {
    ...existingImageInfo,
    ...(nextTypes.length ? { type: nextTypes } : {}),
    productNum: durationValue,
    durationNum: durationValue,
  };
}
