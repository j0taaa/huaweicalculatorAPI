import type { CatalogPricingMode } from "@/lib/catalog";
import { getDiskTypeDisplayName, normalizeDiskTypeApiCode } from "@/lib/disk-types";

type EvsPayloadLabelOptions = {
  productType?: string | null;
  resourceMeasureName?: string | null;
  resourceMeasurePluralName?: string | null;
  addToListTitle?: string | null;
  quantityMeasureName?: string | null;
  quantityMeasurePluralName?: string | null;
};

type EvsBuyUrlOptions = {
  region: string;
  pricingMode: Exclude<CatalogPricingMode, "RI">;
  diskType: string;
  diskSize: number;
  quantity: number;
};

export type EvsPayloadLabels = {
  productType: string;
  resourceMeasureName: string;
  resourceMeasurePluralName: string;
  addToListTitle: string;
  quantityMeasureName: string;
  quantityMeasurePluralName: string;
};

export function buildEvsPayloadLabels(options: EvsPayloadLabelOptions = {}): EvsPayloadLabels {
  return {
    productType: options.productType?.trim() || "calc_7_",
    resourceMeasureName: options.resourceMeasureName?.trim() || "detail_42_",
    resourceMeasurePluralName: options.resourceMeasurePluralName?.trim() || "detail_42_",
    addToListTitle: options.addToListTitle?.trim() || "calc_4_",
    quantityMeasureName: options.quantityMeasureName?.trim() || "calc_5_",
    quantityMeasurePluralName: options.quantityMeasurePluralName?.trim() || "calc_6_",
  };
}

export function buildEvsBuyUrl(options: EvsBuyUrlOptions): string {
  const url = new URL("https://console-intl.huaweicloud.com/ecm/");
  url.searchParams.set("region", options.region);
  url.searchParams.set("locale", "en-us");
  url.searchParams.set("charging", options.pricingMode === "ONDEMAND" ? "0" : "1");
  url.searchParams.set("type", normalizeDiskTypeApiCode(options.diskType));
  url.searchParams.set("capacity", String(options.diskSize));
  url.searchParams.set("count", String(options.quantity));
  url.searchParams.set("iops", "");
  url.searchParams.set("throughput", "");
  url.searchParams.set("period", "");
  return `${url.toString()}#/evs/createvolume`;
}

export function buildEvsDiskPayloadFields(
  diskType: string,
  diskSize: number,
  labels: EvsPayloadLabels,
) {
  const apiCode = normalizeDiskTypeApiCode(diskType);
  const volumeType = getDiskTypeDisplayName(apiCode);

  return {
    resourceSpecCode: apiCode,
    resourceSpecType: apiCode,
    volumeType,
    productSpecSysDesc: `Disk Specifications:${volumeType}`,
    productType: labels.productType,
    resourceMeasureName: labels.resourceMeasureName,
    resourceMeasurePluralName: labels.resourceMeasurePluralName,
    addToList_title: labels.addToListTitle,
    addToList_product: `${labels.productType} | ${diskSize}${labels.resourceMeasureName}`,
  };
}
