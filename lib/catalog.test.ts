import { describe, expect, test } from "bun:test";
import { dedupeCatalogFlavors, getCatalogFlavors, getFlavorPrice, type ProductFlavor } from "@/lib/catalog";

function makeFlavor(
  resourceSpecCode: string,
  options: Partial<ProductFlavor> = {},
): ProductFlavor {
  return {
    resourceSpecCode,
    ...options,
  };
}

describe("catalog helpers", () => {
  test("getFlavorPrice prefers inquiry result, then amount, then priced plans", () => {
    expect(getFlavorPrice(makeFlavor("ecs.1", { inquiryResult: { amount: 7 } }))).toBe(7);
    expect(getFlavorPrice(makeFlavor("ecs.2", { amount: 11 }))).toBe(11);
    expect(getFlavorPrice(makeFlavor("ecs.3", {
      planList: [{ billingMode: "PERIOD", amount: 30 }],
      bakPlanList: [{ billingMode: "ONDEMAND", amount: 13 }],
    }))).toBe(13);
    expect(getFlavorPrice(makeFlavor("ecs.4"))).toBe(Number.POSITIVE_INFINITY);
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
    expect(flavors.map((flavor) => [flavor.resourceSpecCode, getFlavorPrice(flavor)])).toEqual([
      ["x1.small", 6],
      ["x1.medium", 12],
    ]);
  });
});
