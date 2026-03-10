import { describe, expect, test } from "bun:test";
import {
  buildCatalogDiskPriceEstimate,
  buildCatalogPriceEstimate,
  dedupeCatalogDisks,
  dedupeCatalogFlavors,
  getCatalogFlavors,
  getDiskBasePrice,
  getEffectiveDiskPricingMode,
  getFlavorBasePrice,
  getFlavorCpuCount,
  getFlavorMemoryGb,
  hasCatalogPricingModeSupport,
  selectCheapestFlavorForRequirements,
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
    expect(getFlavorBasePrice(makeFlavor("ecs.6", {
      planList: [
        { billingMode: "RI", originType: "price", amount: 0 },
        { billingMode: "RI", originType: "perPrice", amount: 45.04 },
      ],
    }))).toBe(Number.POSITIVE_INFINITY);
  });

  test("dedupeCatalogFlavors merges pricing plans across duplicate rows", () => {
    const deduped = dedupeCatalogFlavors([
      makeFlavor("c9.large", {
        productId: "expensive",
        planList: [
          { billingMode: "MONTHLY", amount: 90 },
          { billingMode: "ONDEMAND", amount: 9 },
        ],
      }),
      makeFlavor("m9.large", {
        productId: "single",
        amount: 4,
      }),
      makeFlavor("c9.large", {
        productId: "cheap",
        planList: [
          { billingMode: "RI", originType: "price", amount: 0 },
          { billingMode: "RI", originType: "perPrice", amount: 40 },
        ],
      }),
      makeFlavor("c9.large", {
        productId: "yearly",
        planList: [{ billingMode: "YEARLY", amount: 800 }],
      }),
    ]);

    expect(deduped).toHaveLength(2);
    expect(deduped.map((flavor) => flavor.resourceSpecCode)).toEqual(["c9.large", "m9.large"]);
    expect(deduped[0]?.productId).toBe("expensive");
    expect(getFlavorBasePrice(deduped[0]!, "ONDEMAND")).toBe(9);
    expect(getFlavorBasePrice(deduped[0]!, "MONTHLY")).toBe(90);
    expect(getFlavorBasePrice(deduped[0]!, "YEARLY")).toBe(800);
    expect(getFlavorBasePrice(deduped[0]!, "RI")).toBe(40);
  });

  test("getCatalogFlavors returns merged flavors from a catalog body", () => {
    const flavors = getCatalogFlavors({
      product: {
        ec2_vm: [
          makeFlavor("x1.small", {
            amount: 6,
            planList: [{ billingMode: "ONDEMAND", amount: 6 }],
          }),
          makeFlavor("x1.small", {
            planList: [{ billingMode: "MONTHLY", amount: 60 }],
          }),
          makeFlavor("x1.small", {
            planList: [{ billingMode: "RI", originType: "perPrice", amount: 30 }],
          }),
          makeFlavor("x1.medium", { amount: 12 }),
        ],
      },
    });

    expect(flavors).toHaveLength(2);
    expect(flavors.map((flavor) => [flavor.resourceSpecCode, getFlavorBasePrice(flavor)])).toEqual([
      ["x1.small", 6],
      ["x1.medium", 12],
    ]);
    expect(getFlavorBasePrice(flavors[0]!, "MONTHLY")).toBe(60);
    expect(getFlavorBasePrice(flavors[0]!, "RI")).toBe(30);
  });

  test("getCatalogFlavors filters hidden entries and generations not enabled in Huawei calculator config", () => {
    const flavors = getCatalogFlavors({
      product: {
        ec2_vm: [
          makeFlavor("x0.8u.64g", {
            generation: "X0",
            type: "hidden",
            productSpecSysDesc: "Remark:hidden",
          }),
          makeFlavor("t7.medium.2", {
            generation: "T7",
            type: "normal",
            productSpecSysDesc: "Remark:normal",
            planList: [{ billingMode: "ONDEMAND", amount: 0.12 }],
          }),
          makeFlavor("t6.medium.2", {
            generation: "T6",
            type: "normal",
            productSpecSysDesc: "Remark:normal",
            planList: [{ billingMode: "ONDEMAND", amount: 0.11 }],
          }),
        ],
      },
    }, {
      allowedGenerations: ["T6", "C7"],
    });

    expect(flavors.map((flavor) => flavor.resourceSpecCode)).toEqual(["t6.medium.2"]);
  });

  test("getFlavorCpuCount and getFlavorMemoryGb read spec fields and fallback labels", () => {
    expect(getFlavorCpuCount(makeFlavor("c6.large", {
      productSpecSysDesc: "vCPUs:4CORE Memory:16384MB",
    }))).toBe(4);
    expect(getFlavorMemoryGb(makeFlavor("c6.large", {
      productSpecSysDesc: "vCPUs:4CORE Memory:16384MB",
    }))).toBe(16);

    expect(getFlavorCpuCount(makeFlavor("c6.xlarge", {
      cpu: "8 vCPU",
    }))).toBe(8);
    expect(getFlavorMemoryGb(makeFlavor("c6.xlarge", {
      mem: "32 GB",
    }))).toBe(32);

    expect(getFlavorCpuCount(makeFlavor("x1.2u.4g.linux"))).toBe(2);
    expect(getFlavorMemoryGb(makeFlavor("x1.2u.4g.linux"))).toBe(4);
  });

  test("hasCatalogPricingModeSupport ignores synthetic ONDEMAND hydration", () => {
    expect(hasCatalogPricingModeSupport(makeFlavor("x1.2u.4g.linux", {
      amount: 0.1234,
      __hydratedPricingModes: ["ONDEMAND"],
      planList: [
        { billingMode: "RI", originType: "perPrice", amount: 20.07 },
        { billingMode: "ONDEMAND", amount: 0.1234, source: "price_api" },
      ],
    }), "ONDEMAND")).toBe(false);

    expect(hasCatalogPricingModeSupport(makeFlavor("c6.2u.4g.linux", {
      planList: [
        { billingMode: "ONDEMAND", amount: 0.344 },
      ],
    }), "ONDEMAND")).toBe(true);
  });

  test("selectCheapestFlavorForRequirements picks the cheapest flavor that meets minimum specs", () => {
    const flavors = [
      makeFlavor("vm.small", {
        productSpecSysDesc: "vCPUs:2CORE Memory:4096MB",
        planList: [{ billingMode: "MONTHLY", amount: 45 }],
      }),
      makeFlavor("vm.medium", {
        productSpecSysDesc: "vCPUs:2CORE Memory:8192MB",
        planList: [{ billingMode: "MONTHLY", amount: 40 }],
      }),
      makeFlavor("vm.large", {
        productSpecSysDesc: "vCPUs:4CORE Memory:16384MB",
        planList: [{ billingMode: "MONTHLY", amount: 40 }],
      }),
      makeFlavor("vm.unpriced", {
        productSpecSysDesc: "vCPUs:8CORE Memory:32768MB",
      }),
    ];

    expect(selectCheapestFlavorForRequirements(flavors, {
      pricingMode: "MONTHLY",
      minVcpus: 2,
      minRamGb: 8,
    })?.resourceSpecCode).toBe("vm.medium");
    expect(selectCheapestFlavorForRequirements(flavors, {
      pricingMode: "MONTHLY",
      minVcpus: 16,
      minRamGb: 64,
    })).toBeNull();
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
        { billingMode: "RI", originType: "perPrice", periodNum: 3, amount: 40.04 },
        { billingMode: "RI", originType: "perPrice", periodNum: 1, amount: 45.04 },
        { billingMode: "RI", originType: "perEffectivePrice", periodNum: 1, amount: 0.0617 },
      ],
    });

    expect(getFlavorBasePrice(flavor, "MONTHLY")).toBe(33.85);
    expect(getFlavorBasePrice(flavor, "YEARLY")).toBe(310.28);
    expect(getFlavorBasePrice(flavor, "RI")).toBe(45.04);
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

  test("buildCatalogPriceEstimate uses RI purchase pricing without hourly disk math", () => {
    const estimate = buildCatalogPriceEstimate({
      product: {
        ec2_vm: [
          makeFlavor("x1.small", {
            productId: "vm-ri",
            planList: [
              { billingMode: "RI", originType: "perPrice", periodNum: 3, amount: 40.04 },
              { billingMode: "RI", originType: "perPrice", periodNum: 1, amount: 45.04 },
              { billingMode: "RI", originType: "perEffectivePrice", periodNum: 1, amount: 0.0617 },
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
      amount: 45.04,
      discountAmount: 0,
      originalAmount: 45.04,
      currency: "USD",
      productRatingResult: [
        {
          id: "cached-vm-vm-ri",
          productId: "vm-ri",
          amount: 45.04,
          discountAmount: 0,
          originalAmount: 45.04,
        },
        {
          id: "cached-disk-disk-ondemand",
          productId: "disk-ondemand",
          amount: 0,
          discountAmount: 0,
          originalAmount: 0,
        },
      ],
    });
  });

  test("buildCatalogDiskPriceEstimate calculates ONDEMAND EVS totals from cached catalog data", () => {
    const estimate = buildCatalogDiskPriceEstimate({
      product: {
        ebs_volume: [
          makeDisk("SAS", {
            productId: "disk-sas",
            bakPlanList: [{ billingMode: "ONDEMAND", amount: 0.02 }],
          }),
        ],
      },
    }, {
      diskType: "SAS",
      diskSize: 50,
      durationValue: 10,
      quantity: 2,
      pricingMode: "ONDEMAND",
    });

    expect(estimate).toEqual({
      amount: 20,
      discountAmount: 0,
      originalAmount: 20,
      currency: "USD",
      productRatingResult: [
        {
          id: "cached-disk-disk-sas",
          productId: "disk-sas",
          amount: 20,
          discountAmount: 0,
          originalAmount: 20,
        },
      ],
    });
  });

  test("buildCatalogDiskPriceEstimate calculates MONTHLY EVS totals from cached catalog data", () => {
    const estimate = buildCatalogDiskPriceEstimate({
      product: {
        ebs_volume: [
          makeDisk("ESSD", {
            productId: "disk-essd",
            planList: [{ billingMode: "MONTHLY", amount: 0.592 }],
          }),
        ],
      },
    }, {
      diskType: "ESSD",
      diskSize: 40,
      durationValue: 3,
      quantity: 2,
      pricingMode: "MONTHLY",
    });

    expect(estimate).toEqual({
      amount: 142.08,
      discountAmount: 0,
      originalAmount: 142.08,
      currency: "USD",
      productRatingResult: [
        {
          id: "cached-disk-disk-essd",
          productId: "disk-essd",
          amount: 142.08,
          discountAmount: 0,
          originalAmount: 142.08,
        },
      ],
    });
  });
});
