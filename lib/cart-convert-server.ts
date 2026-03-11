import {
  buildCatalogDiskPriceEstimate,
  buildCatalogPriceEstimate,
  getCatalogDisks,
  getCatalogFlavors,
  getEffectiveDiskPricingMode,
  getFlavorBasePrice,
  getFlavorCpuCount,
  getFlavorMemoryGb,
  hasCatalogPricingModeSupport,
  selectCheapestFlavorForRequirements,
  type CatalogPricingMode,
  type PriceResponseBody,
  type ProductDisk,
  type ProductFlavor,
} from "@/lib/catalog";
import { getCatalogCacheSnapshot } from "@/lib/catalog-cache";
import { buildDuplicateCartName } from "@/lib/cart-conversion";
import {
  normalizeDiskTypeApiCode,
} from "@/lib/disk-types";
import {
  buildEcsBuyUrl,
  buildEcsImagePayload,
  buildEcsSystemDiskPayload,
  buildEcsVmPayload,
  getSelectedFlavorRiPlanGroup,
  getEcsSystemDiskStepperType,
} from "@/lib/ecs-payload";
import {
  buildEvsBuyUrl,
  buildEvsDiskPayloadFields,
  buildEvsPayloadLabels,
} from "@/lib/evs-payload";
import { detectHuaweiAccessIssue, detectHuaweiAuthIssue } from "@/lib/huawei-auth";
import { fetchShareCartDetail, getTemplateById, replayRequest } from "@/lib/postman";

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
    [key: string]: unknown;
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
      measureNameBeforeTrans?: string;
      measurePluralNameBeforeTrans?: string;
    };
    purchaseTime?: {
      measureValue?: number;
    };
    chargeMode?: string;
    chargeModeName?: string;
    calculatorPricingMode?: string;
    calculatorDiskPricingMode?: string;
    calculatorDurationUnit?: string;
    tag?: string;
    productAllInfos?: Array<Record<string, unknown>>;
    [key: string]: unknown;
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

type CalculatorCartItemPayload = {
  buyUrl?: string;
  rewriteValue?: Record<string, unknown>;
  selectedProduct?: Record<string, unknown>;
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

type RemoteCartItem = {
  service: CalculatorService;
  description: string;
  region: string;
  quantity: number;
  hours: number;
  pricingMode: CatalogPricingMode;
  diskType: string;
  diskSize: number;
  resourceCode: string;
  vcpus: number;
  ramGb: number;
  payload: CalculatorCartItemPayload;
};

type EcsCalculatorItemConfig = {
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
  region: string;
  quantity: number;
  durationValue: number;
  pricingMode: Exclude<CatalogPricingMode, "RI">;
  diskType: string;
  diskSize: number;
  title: string;
  description: string;
};

type BillingConversionRequest = {
  kind: "billing";
  targetPricingMode: "ONDEMAND" | "RI";
};

type RegionConversionRequest = {
  kind: "region";
  targetRegion: string;
};

export type CartConversionRequest = {
  key: string;
  cookie?: string;
  csrf?: string;
  conversion: BillingConversionRequest | RegionConversionRequest;
};

export type CartConversionResult = {
  nextKey: string;
  sourceName: string;
  duplicateName: string;
};

const DEFAULT_CATALOG_DISK_TYPE = "SAS";
const DEFAULT_ECS_DESCRIPTION = "Elastic Cloud Server";
const DEFAULT_EVS_DESCRIPTION = "Elastic Volume Service";

class HuaweiAuthError extends Error {
  code?: string;
  authMessage?: string;

  constructor(message: string, options?: { code?: string; authMessage?: string }) {
    super(message);
    this.name = "HuaweiAuthError";
    this.code = options?.code;
    this.authMessage = options?.authMessage;
  }
}

class HuaweiAccessError extends Error {
  code?: string;

  constructor(message: string, options?: { code?: string }) {
    super(message);
    this.name = "HuaweiAccessError";
    this.code = options?.code;
  }
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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

function isCatalogPricingMode(value: string): value is CatalogPricingMode {
  return ["ONDEMAND", "MONTHLY", "YEARLY", "RI"].includes(value);
}

function getPricingModeLabel(pricingMode: CatalogPricingMode, service: CalculatorService = "ecs"): string {
  if (service === "evs" && pricingMode === "RI") {
    return "On-demand";
  }

  switch (pricingMode) {
    case "MONTHLY":
      return "Monthly";
    case "YEARLY":
      return "Yearly";
    case "RI":
      return "RI (1 year)";
    default:
      return "On-demand";
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

function getNormalizedDurationValue(pricingMode: CatalogPricingMode, value: string): number {
  const parsed = Number.parseInt(value, 10) || 1;
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

  return isCatalogPricingMode(candidate) ? candidate : "ONDEMAND";
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

function resolveItemDescription(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed || fallback;
}

function getRemoteCartItems(detail: ShareCartDetail): RemoteCartItem[] {
  if (!detail.cartListData?.length) {
    return [];
  }

  return detail.cartListData.map((item) => {
    const selectedProduct = item.selectedProduct ?? {};
    const service = getStoredService(item);
    const productInfos = Array.isArray(selectedProduct.productAllInfos) ? selectedProduct.productAllInfos : [];
    const vmInfo = (productInfos.find((info) => typeof info?.resourceType === "string" && info.resourceType.includes(".vm")) ?? productInfos[0] ?? {}) as Record<string, unknown>;
    const diskInfo = (productInfos.find((info) => typeof info?.resourceType === "string" && info.resourceType.includes(".volume")) ?? productInfos[2] ?? productInfos[0] ?? {}) as Record<string, unknown>;
    const pricingMode = getStoredPricingMode(item);
    const resourceCode = service === "ecs"
      ? (typeof vmInfo.resourceSpecCode === "string" ? vmInfo.resourceSpecCode : "Unknown flavor")
      : normalizeDiskTypeApiCode(typeof diskInfo.resourceSpecCode === "string" ? diskInfo.resourceSpecCode : "Unknown disk");
    const diskType = normalizeDiskTypeApiCode(typeof diskInfo.resourceSpecCode === "string" ? diskInfo.resourceSpecCode : "Disk");
    const diskSize = typeof diskInfo.resourceSize === "number" ? diskInfo.resourceSize : 0;
    const storedDescription = selectedProduct.description?.trim()
      || (typeof item.rewriteValue?.global_DESCRIPTION === "string" ? item.rewriteValue.global_DESCRIPTION.trim() : "")
      || selectedProduct._customTitle?.trim()
      || (service === "ecs" ? DEFAULT_ECS_DESCRIPTION : DEFAULT_EVS_DESCRIPTION);
    const vmFlavor = vmInfo as ProductFlavor;

    return {
      service,
      description: storedDescription,
      region: selectedProduct.region?.trim() || "Unknown region",
      quantity: selectedProduct.purchaseNum?.measureValue ?? (typeof vmInfo.productNum === "number" ? vmInfo.productNum : 1),
      hours: selectedProduct.purchaseTime?.measureValue ?? (typeof vmInfo.usageValue === "number" ? vmInfo.usageValue : 744),
      pricingMode,
      diskType,
      diskSize,
      resourceCode,
      vcpus: service === "ecs" ? getFlavorCpuCount(vmFlavor) : 0,
      ramGb: service === "ecs" ? getFlavorMemoryGb(vmFlavor) : 0,
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
  const riPlanGroup = config.pricingMode === "RI" ? getSelectedFlavorRiPlanGroup(flavor) : null;
  const diskMonthlyAmount = config.pricingMode === "RI"
    ? Number((((disk.planList ?? []).find((plan) => plan.billingMode === diskPricingMode)?.amount ?? (disk.bakPlanList ?? []).find((plan) => plan.billingMode === diskPricingMode)?.amount ?? 0) * config.diskSize * config.quantity * 730).toFixed(5))
    : 0;

  payload.buyUrl = buildEcsBuyUrl({
    baseUrl: payload.buyUrl ?? "",
    region: config.region,
    flavor,
    diskType: config.diskType,
    diskSize: config.diskSize,
    quantity: config.quantity,
    pricingMode: config.pricingMode,
  });

  rewriteValue.global_DESCRIPTION = config.description;
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

  if (config.pricingMode === "RI") {
    templateRender.calculator_ecs_RIRadio = {
      paymentType: riPlanGroup?.paymentType ?? "nodeData.NO_UPFRONT",
      RITime: "nodeData.1_3",
    };
    delete rewriteValue.global_ONDEMANDTIME;
    delete rewriteValue.global_PRICINGMODE;
    delete rewriteValue.global_DISKPRICINGMODE;
    delete rewriteValue.global_DURATIONUNIT;
  } else {
    rewriteValue.global_PRICINGMODE = config.pricingMode;
    rewriteValue.global_DISKPRICINGMODE = diskPricingMode;
    rewriteValue.global_DURATIONUNIT = durationUnit;
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
    delete templateRender.calculator_ecs_RIRadio;
  }

  rewriteValue.template_RENDER = templateRender;

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
  selectedProduct.locationType = "commonAZ";
  selectedProduct.tag = "general.online.portal";
  selectedProduct.serviceCode = "ecs";
  selectedProduct.periodType = config.pricingMode === "RI" ? 3 : 4;
  selectedProduct.periodNum = 1;
  selectedProduct.subscriptionNum = 1;
  selectedProduct.calculatorPricingMode = config.pricingMode;
  selectedProduct.calculatorDiskPricingMode = diskPricingMode;
  selectedProduct.calculatorDurationUnit = durationUnit;
  selectedProduct.amount = priceResponse.amount;
  selectedProduct.discountAmount = priceResponse.discountAmount;
  selectedProduct.originalAmount = priceResponse.originalAmount;
  if (config.pricingMode === "RI") {
    selectedProduct.perAmount = Number((((riPlanGroup?.perPrice ?? 0) * config.quantity) + diskMonthlyAmount).toFixed(5));
    selectedProduct.perDiscountAmount = 0;
    selectedProduct.perOriginalAmount = 0;
    selectedProduct.installAmount = 0;
    delete selectedProduct.purchaseTime;
  } else {
    delete selectedProduct.perAmount;
    delete selectedProduct.perDiscountAmount;
    delete selectedProduct.perOriginalAmount;
    delete selectedProduct.installAmount;
    selectedProduct.purchaseTime = {
      measureValue: config.durationValue,
      measureId: 4,
      measureNameBeforeTrans: "",
      measurePluralNameBeforeTrans: "",
    };
  }
  selectedProduct.purchaseNum = {
    measureValue: config.quantity,
    measureId: 41,
    measureNameBeforeTrans: "calc_29_",
    measurePluralNameBeforeTrans: "calc_30_",
  };

  const nextVmInfo = buildEcsVmPayload({
    existingVmInfo: vmInfo,
    flavor,
    quantity: config.quantity,
    durationValue: config.durationValue,
    pricingMode: config.pricingMode,
    vmRating,
  });

  const nextImageInfo = buildEcsImagePayload({
    existingImageInfo: imageInfo,
    flavor,
    durationValue: config.durationValue,
    pricingMode: config.pricingMode,
    quantity: config.quantity,
  });

  const nextDiskInfo = buildEcsSystemDiskPayload({
    existingDiskInfo: diskInfo,
    disk,
    diskSize: config.diskSize,
    quantity: config.quantity,
    durationValue: config.durationValue,
    pricingMode: config.pricingMode,
    diskRating,
  });

  if (config.pricingMode === "RI") {
    selectedProduct.productAllInfos = [nextImageInfo, nextVmInfo, nextDiskInfo];
  } else {
    productAllInfos[0] = nextVmInfo;
    productAllInfos[1] = nextImageInfo;
    productAllInfos[2] = nextDiskInfo;
    selectedProduct.productAllInfos = productAllInfos;
  }

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

function buildCartMutationUrl(action: "update" | "delete", key: string): string {
  const template = getTemplateById("edit-cart");
  if (!template) {
    throw new Error("Edit cart template is missing");
  }

  const nextUrl = action === "update"
    ? template.url
    : template.url.replace("/share/update", "/share/delete");
  const url = new URL(nextUrl);
  url.searchParams.set("key", key.trim());
  return url.toString();
}

function getEcsSamplePayload(): CalculatorCartItemPayload {
  const template = getTemplateById("edit-cart");
  if (!template || typeof template.bodyJson !== "object" || !template.bodyJson) {
    throw new Error("Edit cart template is missing");
  }

  const samplePayload = (template.bodyJson as EditCartPayload).cartListData?.[0];
  if (!samplePayload) {
    throw new Error("Edit cart template is missing a sample ECS item");
  }

  return cloneJson(samplePayload);
}

async function ensureNoAuthIssue(response: {
  ok: boolean;
  status: number;
  statusText: string;
  contentType: string;
  durationMs: number;
  body: unknown;
  rawTextPreview: string;
}) {
  const authIssue = detectHuaweiAuthIssue(response);
  if (authIssue) {
    throw new HuaweiAuthError(
      "Huawei session expired. Open Session and paste a fresh cookie or HWS_INTL_ID.",
      { code: authIssue.code, authMessage: authIssue.message },
    );
  }

  const accessIssue = detectHuaweiAccessIssue(response);
  if (accessIssue) {
    throw new HuaweiAccessError(accessIssue.message, { code: accessIssue.code });
  }
}

async function createLiveCartWithName(name: string, auth: { cookie?: string; csrf?: string }) {
  const template = getTemplateById("create-cart");
  if (!template || typeof template.bodyJson !== "object" || !template.bodyJson) {
    throw new Error("Create cart template is missing");
  }

  const payload = cloneJson(template.bodyJson as Record<string, unknown>);
  payload.name = name.trim() || "Team proposal cart";
  const result = await replayRequest({
    id: "create-cart",
    cookie: auth.cookie,
    csrf: auth.csrf,
    bodyRaw: JSON.stringify(payload),
  });
  await ensureNoAuthIssue(result.response);

  const key = (result.response.body as { data?: string }).data;
  if (typeof key !== "string" || !key.trim()) {
    throw new Error("Huawei create cart did not return a cart key");
  }

  return key.trim();
}

async function submitCartUpdate(key: string, payload: EditCartPayload, auth: { cookie?: string; csrf?: string }) {
  const result = await replayRequest({
    id: "edit-cart",
    cookie: auth.cookie,
    csrf: auth.csrf,
    url: buildCartMutationUrl("update", key),
    bodyRaw: JSON.stringify(payload),
  });
  await ensureNoAuthIssue(result.response);
}

async function getCatalogBody(region: string): Promise<unknown> {
  const snapshot = await getCatalogCacheSnapshot(region);
  if (!snapshot.entry) {
    throw new Error(snapshot.regionErrors[region] ?? `No cached catalog for region ${region}`);
  }

  return snapshot.entry.response.body;
}

async function buildBillingConversionItems(detail: ShareCartDetail, targetPricingMode: "ONDEMAND" | "RI") {
  const samplePayload = getEcsSamplePayload();
  const items = getRemoteCartItems(detail);
  const catalogPromises = new Map<string, Promise<unknown>>();
  const getCatalog = async (region: string) => {
    const cachedPromise = catalogPromises.get(region);
    if (cachedPromise) {
      return cachedPromise;
    }

    const nextPromise = getCatalogBody(region);
    catalogPromises.set(region, nextPromise);
    return nextPromise;
  };

  await Promise.all(Array.from(new Set(items.map((item) => item.region))).map((region) => getCatalog(region)));

  const convertedItems: CalculatorCartItemPayload[] = [];
  for (const item of items) {
    const description = resolveItemDescription(
      item.description,
      item.service === "ecs" ? item.resourceCode : DEFAULT_EVS_DESCRIPTION,
    );
    const catalogBody = await getCatalog(item.region);

    if (item.service === "ecs") {
      const targetDiskType = normalizeDiskTypeApiCode(item.diskType) || DEFAULT_CATALOG_DISK_TYPE;
      const durationValue = getNormalizedDurationValue(targetPricingMode, String(item.hours));
      const targetDisk = getCatalogDisks(catalogBody).find((disk) => disk.resourceSpecCode === targetDiskType);
      if (!targetDisk) {
        throw new Error(`Disk type ${targetDiskType} is unavailable in ${item.region}`);
      }

      const targetFlavors = getCatalogFlavors(catalogBody);
      const currentFlavor = targetFlavors.find((flavor) => (
        flavor.resourceSpecCode === item.resourceCode
        && hasCatalogPricingModeSupport(flavor, targetPricingMode)
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

      convertedItems.push(buildEcsCalculatorItemPayload(samplePayload, matchedFlavor, targetDisk, estimate, {
        region: item.region,
        quantity: item.quantity,
        durationValue,
        pricingMode: targetPricingMode,
        diskType: targetDiskType,
        diskSize: item.diskSize,
        title: description,
        description,
      }));
      continue;
    }

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

    convertedItems.push(buildEvsCalculatorItemPayload(item.payload, targetDisk, estimate, {
      region: item.region,
      quantity: item.quantity,
      durationValue,
      pricingMode: "ONDEMAND",
      diskType: targetDiskType,
      diskSize: item.diskSize,
      title: description,
      description,
    }));
  }

  return convertedItems;
}

async function buildRegionConversionItems(detail: ShareCartDetail, targetRegion: string) {
  const samplePayload = getEcsSamplePayload();
  const items = getRemoteCartItems(detail);
  const catalogBody = await getCatalogBody(targetRegion);

  return items.map((item) => {
    const description = resolveItemDescription(
      item.description,
      item.service === "ecs" ? item.resourceCode : DEFAULT_EVS_DESCRIPTION,
    );

    if (item.service === "ecs") {
      const targetDiskType = normalizeDiskTypeApiCode(item.diskType) || DEFAULT_CATALOG_DISK_TYPE;
      const targetDisk = getCatalogDisks(catalogBody).find((disk) => disk.resourceSpecCode === targetDiskType);
      if (!targetDisk) {
        throw new Error(`Disk type ${targetDiskType} is unavailable in ${targetRegion}`);
      }

      if (item.vcpus <= 0 || item.ramGb <= 0) {
        throw new Error(`Unable to determine the source specs for ${description}. Region conversion requires both vCPU and RAM.`);
      }

      const targetFlavors = getCatalogFlavors(catalogBody);
      const targetFlavor = selectCheapestFlavorForRequirements(targetFlavors, {
        pricingMode: item.pricingMode,
        minVcpus: item.vcpus,
        minRamGb: item.ramGb,
      });
      if (!targetFlavor) {
        throw new Error(`No ${getPricingModeLabel(item.pricingMode)} ECS in ${targetRegion} matches ${item.vcpus} vCPU / ${item.ramGb.toFixed(0)} GB RAM`);
      }

      const durationValue = getNormalizedDurationValue(item.pricingMode, String(item.hours));
      const estimate = buildCatalogPriceEstimate(catalogBody, {
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

      return buildEcsCalculatorItemPayload(samplePayload, targetFlavor, targetDisk, estimate, {
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
    const targetDisk = getCatalogDisks(catalogBody).find((disk) => disk.resourceSpecCode === targetDiskType);
    if (!targetDisk) {
      throw new Error(`Disk type ${targetDiskType} is unavailable in ${targetRegion}`);
    }

    const durationValue = getNormalizedDurationValue(targetPricingMode, String(item.hours));
    const estimate = buildCatalogDiskPriceEstimate(catalogBody, {
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
  });
}

export async function convertCartOnServer(request: CartConversionRequest): Promise<CartConversionResult> {
  const detailResult = await fetchShareCartDetail({
    key: request.key.trim(),
    cookie: request.cookie,
    csrf: request.csrf,
  });
  await ensureNoAuthIssue(detailResult.response);

  const detail = getShareCartDetail(detailResult.response.body);
  if (!detail) {
    throw new Error("Huawei cart detail did not return a usable payload");
  }

  const sourceName = detail.name?.trim() || "Calculator cart";
  const duplicateName = request.conversion.kind === "billing"
    ? buildDuplicateCartName(sourceName, request.conversion.targetPricingMode === "RI" ? "RI ECS" : "Pay-per-use ECS")
    : buildDuplicateCartName(sourceName, request.conversion.targetRegion.trim() || "Converted");

  const nextKey = await createLiveCartWithName(duplicateName, {
    cookie: request.cookie,
    csrf: request.csrf,
  });

  const originalItems = (detail.cartListData ?? []).map((item) => cloneJson(item as CalculatorCartItemPayload));
  const duplicatePayload: EditCartPayload = {
    billingMode: detail.billingMode || "cart.shareList.billingModeTotal",
    cartListData: originalItems,
    name: duplicateName,
    totalPrice: buildCartTotalPrice(originalItems),
  };
  await submitCartUpdate(nextKey, duplicatePayload, {
    cookie: request.cookie,
    csrf: request.csrf,
  });

  const convertedItems = request.conversion.kind === "billing"
    ? await buildBillingConversionItems(detail, request.conversion.targetPricingMode)
    : await buildRegionConversionItems(detail, request.conversion.targetRegion.trim());
  const nextPayload: EditCartPayload = {
    billingMode: detail.billingMode || "cart.shareList.billingModeTotal",
    cartListData: convertedItems.map((item) => cloneJson(item)),
    name: duplicateName,
    totalPrice: buildCartTotalPrice(convertedItems),
  };
  await submitCartUpdate(nextKey, nextPayload, {
    cookie: request.cookie,
    csrf: request.csrf,
  });

  return {
    nextKey,
    sourceName,
    duplicateName,
  };
}

export function isHuaweiAuthError(error: unknown): error is HuaweiAuthError {
  return error instanceof HuaweiAuthError;
}

export function isHuaweiAccessError(error: unknown): error is HuaweiAccessError {
  return error instanceof HuaweiAccessError;
}
