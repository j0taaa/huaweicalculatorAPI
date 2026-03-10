import { describe, expect, test } from "bun:test";
import { getDiskBasePrice, getFlavorBasePrice, type ProductDisk, type ProductFlavor } from "@/lib/catalog";
import { hydrateCatalogEntryPrices, type CachedReplayResult } from "@/lib/catalog-db";

function makeFlavor(
  resourceSpecCode: string,
  options: Partial<ProductFlavor> = {},
): ProductFlavor {
  return {
    resourceSpecCode,
    ...options,
  };
}

function makeDisk(
  resourceSpecCode: string,
  options: Partial<ProductDisk> = {},
): ProductDisk {
  return {
    resourceSpecCode,
    ...options,
  };
}

function makeEntry(flavor: ProductFlavor, disk: ProductDisk): CachedReplayResult {
  return {
    endpoint: {
      id: "get-product-options-and-info",
      name: "Get product options and info",
    },
    request: {
      method: "GET",
      url: "https://example.com/catalog",
      headers: {},
      bodyRaw: null,
      useCapturedAuth: false,
    },
    response: {
      ok: true,
      status: 200,
      statusText: "OK",
      contentType: "application/json",
      durationMs: 100,
      rawTextPreview: "",
      body: {
        product: {
          ec2_vm: [flavor],
          ebs_volume: [disk],
        },
      },
    },
    testedAt: "2026-03-07T00:00:00.000Z",
  };
}

describe("catalog DB hydration", () => {
  test("hydrateCatalogEntryPrices fills missing ONDEMAND prices from stored price rows", () => {
    const entry = makeEntry(
      makeFlavor("x0.8u.64g.linux", {
        planList: [
          { billingMode: "RI", originType: "price", periodNum: 1, amount: 0 },
          { billingMode: "RI", originType: "perPrice", periodNum: 1, amount: 104.68 },
        ],
      }),
      makeDisk("GPSSD", {}),
    );

    const hydrated = hydrateCatalogEntryPrices(entry, [
      { resource_spec_code: "x0.8u.64g.linux", pricing_mode: "ONDEMAND", amount: 0.3584 },
      { resource_spec_code: "x0.8u.64g.linux", pricing_mode: "RI", amount: 104.68 },
    ], [
      { resource_spec_code: "GPSSD", pricing_mode: "ONDEMAND", amount: 0.000247 },
    ]);

    const flavor = (hydrated.response.body as { product: { ec2_vm: ProductFlavor[] } }).product.ec2_vm[0]!;
    const disk = (hydrated.response.body as { product: { ebs_volume: ProductDisk[] } }).product.ebs_volume[0]!;

    expect(getFlavorBasePrice(flavor, "ONDEMAND")).toBe(0.3584);
    expect(getFlavorBasePrice(flavor, "RI")).toBe(104.68);
    expect(getDiskBasePrice(disk, "ONDEMAND")).toBe(0.000247);
  });

  test("hydrateCatalogEntryPrices marks synthesized RI plans as 1-year", () => {
    const entry = makeEntry(
      makeFlavor("x1.2u.4g.linux", {}),
      makeDisk("GPSSD", {}),
    );

    const hydrated = hydrateCatalogEntryPrices(entry, [
      { resource_spec_code: "x1.2u.4g.linux", pricing_mode: "RI", amount: 45.04 },
    ], []);

    const flavor = (hydrated.response.body as { product: { ec2_vm: ProductFlavor[] } }).product.ec2_vm[0]!;
    const riPlan = flavor.planList?.find((plan) => plan.billingMode === "RI");

    expect(riPlan?.periodNum).toBe(1);
    expect(riPlan?.amount).toBe(45.04);
    expect(getFlavorBasePrice(flavor, "RI")).toBe(45.04);
  });
});
