import { describe, expect, test } from "bun:test";
import { buildCatalogPriceEstimate, dedupeCatalogFlavors, getCatalogFlavors, getDiskBasePrice, getFlavorBasePrice, type ProductDisk, type ProductFlavor } from "@/lib/catalog";

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

describe("catalog helpers", () => {
  test("getFlavorBasePrice prefers ONDEMAND plans and ignores rolled-up inquiry totals", () => {
    expect(getFlavorBasePrice(makeFlavor("ecs.1", {
      amount: 11,
      inquiryResult: { amount: 700 },
      bakPlanList: [{ billingMode: "ONDEMAND", amount: 7 }],
    }))).toBe(7);
    expect(getFlavorBasePrice(makeFlavor("ecs.2", { amount: 11 }))).toBe(11);
    expect(getFlavorBasePrice(makeFlavor("ecs.3", {
      planList: [{ billingMode: "PERIOD", amount: 30 }],
      bakPlanList: [{ billingMode: "ONDEMAND", amount: 13 }],
    }))).toBe(13);
    expect(getFlavorBasePrice(makeFlavor("ecs.4", {
      inquiryResult: { perAmount: 5, amount: 50 },
    }))).toBe(5);
    expect(getFlavorBasePrice(makeFlavor("ecs.5"))).toBe(Number.POSITIVE_INFINITY);
  });

  test("dedupeCatalogFlavors keeps one flavor per code and prefers the cheaper duplicate", () => {
    const deduped = dedupeCatalogFlavors([
      makeFlavor("c9.large", {
        productId: "expensive",
        bakPlanList: [{ billingMode: "ONDEMAND", amount: 9 }],
      }),
      makeFlavor("m9.large", {
        productId: "single",
        amount: 4,
      }),
      makeFlavor("c9.large", {
        productId: "cheap",
        bakPlanList: [{ billingMode: "ONDEMAND", amount: 5 }],
      }),
    ]);

    expect(deduped).toHaveLength(2);
    expect(deduped.map((flavor) => flavor.resourceSpecCode)).toEqual(["c9.large", "m9.large"]);
    expect(deduped[0]?.productId).toBe("cheap");
  });

  test("getCatalogFlavors returns deduped flavors from a catalog body", () => {
    const flavors = getCatalogFlavors({
      product: {
        ec2_vm: [
          makeFlavor("x1.small", { amount: 8 }),
          makeFlavor("x1.small", { amount: 6 }),
          makeFlavor("x1.medium", { amount: 12 }),
        ],
      },
    });

    expect(flavors).toHaveLength(2);
    expect(flavors.map((flavor) => [flavor.resourceSpecCode, getFlavorBasePrice(flavor)])).toEqual([
      ["x1.small", 6],
      ["x1.medium", 12],
    ]);
  });

  test("getDiskBasePrice prefers ONDEMAND disk plans", () => {
    expect(getDiskBasePrice(makeDisk("GPSSD", {
      amount: 1,
      bakPlanList: [{ billingMode: "ONDEMAND", amount: 0.000247 }],
    }))).toBe(0.000247);
  });

  test("buildCatalogPriceEstimate calculates VM and disk totals from cached catalog data", () => {
    const estimate = buildCatalogPriceEstimate({
      product: {
        ec2_vm: [
          makeFlavor("x1.small", {
            productId: "vm-1",
            bakPlanList: [{ billingMode: "ONDEMAND", amount: 0.1 }],
          }),
        ],
        ebs_volume: [
          makeDisk("GPSSD", {
            productId: "disk-1",
            bakPlanList: [{ billingMode: "ONDEMAND", amount: 0.01 }],
          }),
        ],
      },
    }, {
      flavorCode: "x1.small",
      diskType: "GPSSD",
      diskSize: 40,
      hours: 10,
      quantity: 2,
    });

    expect(estimate).toEqual({
      amount: 10,
      discountAmount: 0,
      originalAmount: 10,
      currency: "USD",
      productRatingResult: [
        {
          id: "cached-vm-vm-1",
          productId: "vm-1",
          amount: 2,
          discountAmount: 0,
          originalAmount: 2,
        },
        {
          id: "cached-disk-disk-1",
          productId: "disk-1",
          amount: 8,
          discountAmount: 0,
          originalAmount: 8,
        },
      ],
    });
  });
});
