import { expect, test } from "bun:test";
import {
  BRAZIL_REGION,
  SANTIAGO_REGION,
  buildDuplicateCartName,
  getDefaultBillingConversionTarget,
  getDefaultRegionConversionTarget,
  getDominantCartRegion,
} from "@/lib/cart-conversion";

test("getDominantCartRegion returns the most common region", () => {
  expect(getDominantCartRegion([
    { region: BRAZIL_REGION },
    { region: BRAZIL_REGION },
    { region: SANTIAGO_REGION },
  ])).toBe(BRAZIL_REGION);
});

test("getDefaultRegionConversionTarget swaps brazil and santiago", () => {
  expect(getDefaultRegionConversionTarget(BRAZIL_REGION)).toBe(SANTIAGO_REGION);
  expect(getDefaultRegionConversionTarget(SANTIAGO_REGION)).toBe(BRAZIL_REGION);
});

test("getDefaultRegionConversionTarget falls back to brazil", () => {
  expect(getDefaultRegionConversionTarget("ap-southeast-3")).toBe(BRAZIL_REGION);
});

test("getDefaultBillingConversionTarget flips the dominant ECS pricing mode", () => {
  expect(getDefaultBillingConversionTarget([
    { service: "ecs", pricingMode: "ONDEMAND", region: BRAZIL_REGION },
    { service: "ecs", pricingMode: "ONDEMAND", region: BRAZIL_REGION },
    { service: "evs", pricingMode: "ONDEMAND", region: BRAZIL_REGION },
  ])).toBe("RI");

  expect(getDefaultBillingConversionTarget([
    { service: "ecs", pricingMode: "RI", region: BRAZIL_REGION },
    { service: "evs", pricingMode: "ONDEMAND", region: BRAZIL_REGION },
  ])).toBe("ONDEMAND");
});

test("buildDuplicateCartName appends the conversion suffix", () => {
  expect(buildDuplicateCartName("Team proposal cart", "RI ECS")).toBe("Team proposal cart (RI ECS)");
  expect(buildDuplicateCartName("", "LA-Santiago")).toBe("Calculator cart (LA-Santiago)");
});
