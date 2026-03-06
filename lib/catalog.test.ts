import { describe, expect, test } from "bun:test";
import {
  buildCatalogPriceEstimate,
  dedupeCatalogDisks,
  dedupeCatalogFlavors,
  getCatalogFlavors,
  getDiskBasePrice,
  getEffectiveDiskPricingMode,
  getFlavorBasePrice,
  type ProductDisk,
  type ProductFlavor,
} from "@/lib/catalog";

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

  test("dedupeCatalogDisks keeps one disk per code and prefers the cheaper duplicate", () => {
    const deduped = dedupeCatalogDisks([
      makeDisk("GPSSD", {
        planList: [{ billingMode: "ONDEMAND", amount: 0.1 }],
      }),
      makeDisk("ESSD", {
        amount: 0.2,
      }),
      makeDisk("GPSSD", {
        planList: [{ billingMode: "ONDEMAND", amount: 0.01 }],
      }),
    ]);

    expect(deduped).toHaveLength(2);
    expect(deduped.map((disk) => [disk.resourceSpecCode, getDiskBasePrice(disk)])).toEqual([
      ["GPSSD", 0.01],
      ["ESSD", 0.2],
    ]);
  });

  test("getFlavorBasePrice can read MONTHLY, YEARLY, and RI plan pricing", () => {
    const flavor = makeFlavor("x1.small", {
      planList: [
        { billingMode: "MONTHLY", amount: 33.85 },
        { billingMode: "YEARLY", amount: 310.28 },
        { billingMode: "RI", originType: "price", amount: 0 },
        { billingMode: "RI", originType: "perPrice", amount: 45.04 },
        { billingMode: "RI", originType: "perEffectivePrice", amount: 0.0617 },
      ],
    });

    expect(getFlavorBasePrice(flavor, "MONTHLY")).toBe(33.85);
    expect(getFlavorBasePrice(flavor, "YEARLY")).toBe(310.28);
    expect(getFlavorBasePrice(flavor, "RI")).toBe(0.0617);
  });

  test("getEffectiveDiskPricingMode falls back to ONDEMAND for RI", () => {
    expect(getEffectiveDiskPricingMode("ONDEMAND")).toBe("ONDEMAND");
    expect(getEffectiveDiskPricingMode("MONTHLY")).toBe("MONTHLY");
    expect(getEffectiveDiskPricingMode("YEARLY")).toBe("YEARLY");
    expect(getEffectiveDiskPricingMode("RI")).toBe("ONDEMAND");
  });

  test("buildCatalogPriceEstimate calculates ONDEMAND totals from cached catalog data", () => {
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
      durationValue: 10,
      quantity: 2,
      pricingMode: "ONDEMAND",
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

  test("buildCatalogPriceEstimate calculates MONTHLY totals from cached catalog data", () => {
    const estimate = buildCatalogPriceEstimate({
      product: {
        ec2_vm: [
          makeFlavor("x1.small", {
            productId: "vm-monthly",
            planList: [{ billingMode: "MONTHLY", amount: 33.85 }],
          }),
        ],
        ebs_volume: [
          makeDisk("GPSSD", {
            productId: "disk-monthly",
            planList: [{ billingMode: "MONTHLY", amount: 0.18 }],
          }),
        ],
      },
    }, {
      flavorCode: "x1.small",
      diskType: "GPSSD",
      diskSize: 40,
      durationValue: 3,
      quantity: 2,
      pricingMode: "MONTHLY",
    });

    expect(estimate).toEqual({
      amount: 246.3,
      discountAmount: 0,
      originalAmount: 246.3,
      currency: "USD",
      productRatingResult: [
        {
          id: "cached-vm-vm-monthly",
          productId: "vm-monthly",
          amount: 203.1,
          discountAmount: 0,
          originalAmount: 203.1,
        },
        {
          id: "cached-disk-disk-monthly",
          productId: "disk-monthly",
          amount: 43.2,
          discountAmount: 0,
          originalAmount: 43.2,
        },
      ],
    });
  });

  test("buildCatalogPriceEstimate uses RI VM pricing and ONDEMAND disk fallback", () => {
    const estimate = buildCatalogPriceEstimate({
      product: {
        ec2_vm: [
          makeFlavor("x1.small", {
            productId: "vm-ri",
            planList: [
              { billingMode: "RI", originType: "perPrice", amount: 45.04 },
              { billingMode: "RI", originType: "perEffectivePrice", amount: 0.0617 },
            ],
          }),
        ],
        ebs_volume: [
          makeDisk("GPSSD", {
            productId: "disk-ondemand",
            bakPlanList: [{ billingMode: "ONDEMAND", amount: 0.01 }],
          }),
        ],
      },
    }, {
      flavorCode: "x1.small",
      diskType: "GPSSD",
      diskSize: 40,
      durationValue: 24,
      quantity: 1,
      pricingMode: "RI",
    });

    expect(estimate).toEqual({
      amount: 11.0808,
      discountAmount: 0,
      originalAmount: 11.0808,
      currency: "USD",
      productRatingResult: [
        {
          id: "cached-vm-vm-ri",
          productId: "vm-ri",
          amount: 1.4808,
          discountAmount: 0,
          originalAmount: 1.4808,
        },
        {
          id: "cached-disk-disk-ondemand",
          productId: "disk-ondemand",
          amount: 9.6,
          discountAmount: 0,
          originalAmount: 9.6,
        },
      ],
    });
  });
});
