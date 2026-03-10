import { expect, test } from "bun:test";
import { buildEcsImagePayload, buildEcsSystemDiskPayload, getEcsSystemDiskStepperType } from "@/lib/ecs-payload";

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
      type: "dataInfo_43_",
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
      type: "dataInfo_24_",
      amount: 0.000112,
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
  expect(payload.billingMode).toBe("ONDEMAND");
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

test("buildEcsImagePayload promotes the target flavor family in the image compatibility list", () => {
  const payload = buildEcsImagePayload({
    existingImageInfo: {
      id: "old-image",
      type: ["x1", "c6", "c7"],
    },
    flavor: {
      resourceSpecCode: "c6.2u.4g.linux",
      resourceSpecType: "c6",
    },
    durationValue: 744,
  });

  expect(payload.type).toEqual(["c6", "x1", "c7"]);
  expect(payload.productNum).toBe(744);
  expect(payload.durationNum).toBe(744);
});
