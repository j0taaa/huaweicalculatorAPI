import { expect, test } from "bun:test";
import {
  buildEcsBuyUrl,
  buildEcsFlavorAddToListProduct,
  buildEcsImagePayload,
  buildEcsSystemDiskPayload,
  buildEcsVmPayload,
  getSelectedFlavorRiPlanGroup,
  getEcsSystemDiskStepperType,
} from "@/lib/ecs-payload";

test("getEcsSystemDiskStepperType prefers the catalog disk token", () => {
  expect(getEcsSystemDiskStepperType(
    { resourceSpecCode: "SAS", type: "dataInfo_24_" },
    { type: "dataInfo_43_" },
  )).toBe("dataInfo_24_");
});

test("buildEcsSystemDiskPayload preserves Huawei catalog metadata for High I/O", () => {
  const payload = buildEcsSystemDiskPayload({
    existingDiskInfo: {
      resourceSpecCode: "GPSSD",
      resourceSpecType: "GPSSD",
      volumeType: "General Purpose SSD",
      productSpecSysDesc: "Disk Specifications:General Purpose SSD",
      productId: "00301-247376-0--0",
      billingItem: "detail_68_",
      type: "dataInfo_43_",
      addToList_product: "dataInfo_43_ | 40BSSUNIT.pluralUnit.17",
      bakPlanList: [
        {
          productId: "00301-247376-0--0",
          billingMode: "ONDEMAND",
          usageMeasureId: 6,
          amount: 0.000247,
        },
      ],
      inquiryResult: {
        id: "old-id",
      },
    },
    disk: {
      resourceSpecCode: "SAS",
      resourceSpecType: "High_IO",
      volumeType: "High I/O",
      productSpecSysDesc: "Disk Specifications:High I/O",
      productId: "00301-135025-0--0",
      billingItem: "detail_68_",
      type: "dataInfo_24_",
      amount: 0.000112,
      info: "dataInfo_26_",
      specifications: "dataInfo_27_",
      tableUnit: "detail_26_",
      planList: [
        {
          productId: "00301-135025-0--0",
          billingMode: "ONDEMAND",
          siteCode: "HWC",
          periodNum: null,
          billingEvent: "event.type.volumeduration",
          measureUnitStep: 1,
          measureUnit: 4,
          usageFactor: "Duration",
          usageMeasureId: 6,
          amount: 0.000112,
        },
      ],
    },
    diskSize: 40,
    quantity: 2,
    durationValue: 744,
    pricingMode: "ONDEMAND",
    diskRating: {
      id: "new-id",
      productId: "00301-135025-0--0",
      amount: 6.66,
      originalAmount: 6.66,
    },
  });

  expect(payload.resourceSpecCode).toBe("SAS");
  expect(payload.resourceSpecType).toBe("High_IO");
  expect(payload.volumeType).toBe("High I/O");
  expect(payload.productSpecSysDesc).toBe("Disk Specifications:High I/O");
  expect(payload.productId).toBe("00301-135025-0--0");
  expect(payload.type).toBe("dataInfo_24_");
  expect(payload.addToList_product).toBe("dataInfo_24_ | 40BSSUNIT.pluralUnit.17");
  expect(payload.bakPlanList).toEqual([
    expect.objectContaining({
      productId: "00301-135025-0--0",
      billingMode: "ONDEMAND",
      usageMeasureId: 6,
      amount: 0.000112,
    }),
  ]);
  expect(payload.planList).toBeUndefined();
  expect(payload.billingMode).toBe("ONDEMAND");
  expect(payload.amount).toBe(0.000112);
  expect(payload.usageMeasureId).toBe(6);
  expect(payload.productNum).toBe(2);
  expect(payload.usageValue).toBe(744);
  expect((payload.inquiryResult as { productId?: string }).productId).toBe("00301-135025-0--0");
});

test("buildEcsSystemDiskPayload keeps disk pricing on-demand for RI ECS items", () => {
  const payload = buildEcsSystemDiskPayload({
    existingDiskInfo: {},
    disk: {
      resourceSpecCode: "GPSSD",
      productId: "00301-247376-0--0",
      amount: 0.000247,
    },
    diskSize: 40,
    quantity: 1,
    durationValue: 1,
    pricingMode: "RI",
  });

  expect(payload.billingMode).toBe("ONDEMAND");
});

test("getSelectedFlavorRiPlanGroup picks the 1-year no-upfront RI plan group", () => {
  const group = getSelectedFlavorRiPlanGroup({
    resourceSpecCode: "t6.small.1.linux",
    planList: [
      {
        productId: "ri-product",
        billingMode: "RI",
        originType: "price",
        skuCode: "sku",
        planId: "plan-3y",
        amount: 0,
        amountType: "nodeData.price",
        paymentType: "nodeData.NO_UPFRONT",
        paymentTypeKey: "NO_UPFRONT",
      },
      {
        productId: "ri-product",
        billingMode: "RI",
        originType: "perPrice",
        skuCode: "sku",
        planId: "plan-3y",
        amount: 5.11,
        amountType: "nodeData.perPrice",
        paymentType: "nodeData.NO_UPFRONT",
        paymentTypeKey: "NO_UPFRONT",
      },
      {
        productId: "ri-product",
        billingMode: "RI",
        originType: "price",
        skuCode: "sku",
        planId: "plan-1y",
        amount: 0,
        amountType: "nodeData.price",
        paymentType: "nodeData.NO_UPFRONT",
        paymentTypeKey: "NO_UPFRONT",
      },
      {
        productId: "ri-product",
        billingMode: "RI",
        originType: "perEffectivePrice",
        skuCode: "sku",
        planId: "plan-1y",
        amount: 0.01,
        amountType: "nodeData.perEffectivePrice",
        paymentType: "nodeData.NO_UPFRONT",
        paymentTypeKey: "NO_UPFRONT",
      },
      {
        productId: "ri-product",
        billingMode: "RI",
        originType: "perPrice",
        skuCode: "sku",
        planId: "plan-1y",
        amount: 7.3,
        amountType: "nodeData.perPrice",
        paymentType: "nodeData.NO_UPFRONT",
        paymentTypeKey: "NO_UPFRONT",
      },
      {
        billingMode: "RI",
        originType: "perPrice",
        periodNum: 1,
        amount: 87.6,
        source: "price_api",
      },
    ],
  });

  expect(group).toEqual(expect.objectContaining({
    planId: "plan-1y",
    productId: "ri-product",
    perPrice: 7.3,
    price: 0,
    perEffectivePrice: 0.01,
    paymentType: "nodeData.NO_UPFRONT",
    paymentTypeKey: "NO_UPFRONT",
  }));
  expect(group?.plans.map((plan) => plan.originType)).toEqual(["price", "perEffectivePrice", "perPrice"]);
});

test("buildEcsBuyUrl switches RI items to the createRi flow", () => {
  const url = buildEcsBuyUrl({
    baseUrl: "https://console-intl.huaweicloud.com/ecm/?region=sa-brazil-1&locale=en-us&charging=0&flavor=x1.2u.4g&sysdisk=GPSSD:40&vmcount=1#/ecs/createVm",
    region: "sa-brazil-1",
    flavor: { resourceSpecCode: "t6.small.1.linux", spec: "t6.small.1" },
    diskType: "SAS",
    diskSize: 40,
    quantity: 2,
    pricingMode: "RI",
  });

  expect(url).toBe("https://console-intl.huaweicloud.com/ecm/?region=sa-brazil-1&locale=en-us#/ecs/createRi");
});

test("buildEcsVmPayload writes Huawei RI plan metadata instead of on-demand product ids", () => {
  const payload = buildEcsVmPayload({
    existingVmInfo: {
      productId: "ondemand-product",
      inquiryResult: { id: "vm-id" },
      addToList_product: "dataInfo_32_ | dataInfo_5_ | t6.small.1 | 1dataInfo_36_ | 1BSSUNIT.pluralUnit.102",
    },
    flavor: {
      resourceSpecCode: "t6.small.1.linux",
      spec: "t6.small.1",
      cpu: "1dataInfo_36_",
      mem: "1BSSUNIT.pluralUnit.102",
      planList: [
        {
          productId: "ri-product",
          billingMode: "RI",
          originType: "price",
          skuCode: "ri-sku",
          planId: "ri-plan-3y",
          amount: 0,
          amountType: "nodeData.price",
          paymentType: "nodeData.NO_UPFRONT",
          paymentTypeKey: "NO_UPFRONT",
        },
        {
          productId: "ri-product",
          billingMode: "RI",
          originType: "perPrice",
          skuCode: "ri-sku",
          planId: "ri-plan-3y",
          amount: 5.11,
          amountType: "nodeData.perPrice",
          paymentType: "nodeData.NO_UPFRONT",
          paymentTypeKey: "NO_UPFRONT",
        },
        {
          productId: "ri-product",
          billingMode: "RI",
          originType: "price",
          skuCode: "ri-sku",
          planId: "ri-plan-1y",
          amount: 0,
          amountType: "nodeData.price",
          paymentType: "nodeData.NO_UPFRONT",
          paymentTypeKey: "NO_UPFRONT",
        },
        {
          productId: "ri-product",
          billingMode: "RI",
          originType: "perEffectivePrice",
          skuCode: "ri-sku",
          planId: "ri-plan-1y",
          amount: 0.01,
          amountType: "nodeData.perEffectivePrice",
          paymentType: "nodeData.NO_UPFRONT",
          paymentTypeKey: "NO_UPFRONT",
        },
        {
          productId: "ri-product",
          billingMode: "RI",
          originType: "perPrice",
          skuCode: "ri-sku",
          planId: "ri-plan-1y",
          amount: 7.3,
          amountType: "nodeData.perPrice",
          paymentType: "nodeData.NO_UPFRONT",
          paymentTypeKey: "NO_UPFRONT",
        },
      ],
    },
    quantity: 2,
    durationValue: 1,
    pricingMode: "RI",
    vmRating: {
      id: "vm-rating",
      productId: "ri-product",
      amount: 175.2,
      originalAmount: 175.2,
    },
  });

  expect(payload.billingMode).toBe("RI");
  expect(payload.productId).toBe("ri-product");
  expect(payload.planId).toBe("ri-plan-1y");
  expect(payload.skuCode).toBe("ri-sku");
  expect(payload.perPrice).toBe(7.3);
  expect(payload.RITime).toBe("nodeData.1_3");
  expect(payload.paymentType).toBe("nodeData.NO_UPFRONT");
  expect(payload.addToList_product).toContain("nodeData.NO_UPFRONT");
  expect(payload.addToList_product).toContain("nodeData.1_3");
  expect(payload.bakPlanList).toHaveLength(3);
  expect((payload.inquiryResult as { amount?: number; perAmount?: number }).amount).toBe(175.2);
  expect((payload.inquiryResult as { amount?: number; perAmount?: number }).perAmount).toBe(14.6);
});

test("buildEcsSystemDiskPayload annualizes RI system disks for Huawei combine billing", () => {
  const payload = buildEcsSystemDiskPayload({
    existingDiskInfo: {
      selfProductNum: 1,
      inquiryResult: { id: "disk-id" },
    },
    disk: {
      resourceSpecCode: "SAS",
      resourceSpecType: "High_IO",
      volumeType: "High I/O",
      productSpecSysDesc: "Disk Specifications:High I/O",
      productId: "00301-135025-0--0",
      billingItem: "detail_68_",
      type: "dataInfo_24_",
      amount: 0.000112,
      planList: [
        {
          productId: "00301-135025-0--0",
          billingMode: "ONDEMAND",
          siteCode: "HWC",
          periodNum: null,
          billingEvent: "event.type.volumeduration",
          measureUnitStep: 1,
          measureUnit: 4,
          usageFactor: "Duration",
          usageMeasureId: 6,
          amount: 0.000112,
        },
      ],
    },
    diskSize: 40,
    quantity: 1,
    durationValue: 1,
    pricingMode: "RI",
    diskRating: {
      id: "disk-rating",
      productId: "00301-135025-0--0",
      amount: 39.2448,
      originalAmount: 39.2448,
    },
  });

  expect(payload.billingMode).toBe("ONDEMAND");
  expect(payload.inquiryTag).toBe("combine");
  expect(payload.usageValue).toBe(730);
  expect(payload.cpqPurchaseDuration).toBe(8760);
  expect(payload.usageMeasureId).toBe(4);
  expect(payload.bakPlanList).toEqual([
    expect.objectContaining({
      productId: "00301-135025-0--0",
      usageMeasureId: 4,
    }),
  ]);
  expect((payload.inquiryResult as { amount?: number; perAmount?: number; installAmount?: number }).amount).toBe(39.2448);
  expect((payload.inquiryResult as { amount?: number; perAmount?: number; installAmount?: number }).perAmount).toBe(3.2704);
  expect((payload.inquiryResult as { amount?: number; perAmount?: number; installAmount?: number }).installAmount).toBe(0);
  expect(payload.inquiryResult).not.toHaveProperty("measureId");
});

test("buildEcsImagePayload keeps only the target flavor family in the image compatibility list", () => {
  const payload = buildEcsImagePayload({
    existingImageInfo: {
      id: "old-image",
      type: ["x1", "c6", "c7"],
    },
    flavor: {
      resourceSpecCode: "c6.2u.4g.linux",
      resourceSpecType: "c6_2",
    },
    durationValue: 744,
  });

  expect(payload.type).toEqual(["c6"]);
  expect(payload.productNum).toBe(744);
  expect(payload.durationNum).toBe(744);
});

test("buildEcsImagePayload turns RI images into per-instance reservation companions", () => {
  const payload = buildEcsImagePayload({
    existingImageInfo: {
      id: "old-image",
      type: ["t6", "c6"],
      inquiryResult: {
        productId: "noId",
      },
    },
    flavor: {
      resourceSpecCode: "t6.small.1.linux",
      resourceSpecType: "t6",
    },
    durationValue: 1,
    pricingMode: "RI",
    quantity: 3,
  });

  expect(payload.type).toEqual(["t6"]);
  expect(payload.productNum).toBe(3);
  expect(payload.durationNum).toBeUndefined();
  expect((payload.inquiryResult as { installNum?: number; perAmount?: number }).installNum).toBe(12);
  expect((payload.inquiryResult as { installNum?: number; perAmount?: number }).perAmount).toBe(0);
});

test("buildEcsFlavorAddToListProduct rewrites the display label with the target flavor spec", () => {
  const label = buildEcsFlavorAddToListProduct(
    {
      resourceSpecCode: "c6.2u.4g.linux",
      spec: "c6.2u.4g",
      arch: "dataInfo_32_",
      vmType: "dataInfo_3_",
      cpu: "2dataInfo_36_",
      mem: "4BSSUNIT.pluralUnit.102",
    },
    {
      addToList_product: "dataInfo_32_ | dataInfo_1_ | x1.2u.4g | 2dataInfo_36_ | 4BSSUNIT.pluralUnit.102",
    },
  );

  expect(label).toBe("dataInfo_32_ | dataInfo_3_ | c6.2u.4g | 2dataInfo_36_ | 4BSSUNIT.pluralUnit.102");
});
