import type { CatalogPricingMode } from "@/lib/catalog";

export const BRAZIL_REGION = "sa-brazil-1";
export const SANTIAGO_REGION = "la-south-2";

type RegionLike = {
  region: string;
};

type CartItemLike = RegionLike & {
  service: "ecs" | "evs";
  pricingMode: CatalogPricingMode;
};

function getMostCommonValue(values: string[]): string {
  const counts = new Map<string, number>();
  let winner = "";
  let winnerCount = 0;

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) {
      continue;
    }

    const nextCount = (counts.get(normalized) ?? 0) + 1;
    counts.set(normalized, nextCount);
    if (nextCount > winnerCount) {
      winner = normalized;
      winnerCount = nextCount;
    }
  }

  return winner;
}

export function getDominantCartRegion(items: RegionLike[]): string {
  return getMostCommonValue(items.map((item) => item.region));
}

export function getDefaultRegionConversionTarget(sourceRegion: string): string {
  const normalized = sourceRegion.trim();
  if (normalized === BRAZIL_REGION) {
    return SANTIAGO_REGION;
  }

  if (normalized === SANTIAGO_REGION) {
    return BRAZIL_REGION;
  }

  return BRAZIL_REGION;
}

export function getDefaultBillingConversionTarget(items: CartItemLike[]): "ONDEMAND" | "RI" {
  const ecsPricingModes = items
    .filter((item) => item.service === "ecs")
    .map((item) => item.pricingMode)
    .filter((pricingMode): pricingMode is "ONDEMAND" | "RI" => pricingMode === "ONDEMAND" || pricingMode === "RI");

  const dominant = getMostCommonValue(ecsPricingModes);
  return dominant === "RI" ? "ONDEMAND" : "RI";
}

export function buildDuplicateCartName(sourceName: string, suffix: string): string {
  const base = sourceName.trim() || "Calculator cart";
  const normalizedSuffix = suffix.trim();
  return normalizedSuffix ? `${base} (${normalizedSuffix})` : base;
}
