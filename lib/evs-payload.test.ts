import { describe, expect, test } from "bun:test";

import {
  buildEvsBuyUrl,
  buildEvsDiskPayloadFields,
  buildEvsPayloadLabels,
} from "@/lib/evs-payload";

describe("evs payload helpers", () => {
  test("buildEvsBuyUrl uses the EVS API code in the console URL", () => {
    expect(buildEvsBuyUrl({
      region: "sa-brazil-1",
      pricingMode: "ONDEMAND",
      diskType: "General Purpose SSD",
      diskSize: 40,
      quantity: 1,
    })).toBe(
      "https://console-intl.huaweicloud.com/ecm/?region=sa-brazil-1&locale=en-us&charging=0&type=GPSSD&capacity=40&count=1&iops=&throughput=&period=#/evs/createvolume",
    );
  });

  test("buildEvsDiskPayloadFields keeps API fields canonical and display fields friendly", () => {
    const fields = buildEvsDiskPayloadFields({
      diskType: "General Purpose SSD V2",
      diskSize: 80,
      labels: buildEvsPayloadLabels(),
      resourceSpecType: "General_Purpose_SSD_V2",
      volumeType: "General Purpose SSD V2 for storage",
      productSpecSysDesc: "Disk Specifications:General Purpose SSD V2 for storage",
    });

    expect(fields).toMatchObject({
      resourceSpecCode: "GPSSD2.storage",
      resourceSpecType: "General_Purpose_SSD_V2",
      volumeType: "General Purpose SSD V2 for storage",
      productSpecSysDesc: "Disk Specifications:General Purpose SSD V2 for storage",
      productType: "calc_7_",
      resourceMeasureName: "detail_42_",
      resourceMeasurePluralName: "detail_42_",
      addToList_title: "calc_4_",
      addToList_product: "calc_7_ | 80detail_42_",
    });
  });

  test("buildEvsDiskPayloadFields preserves a catalog resourceSpecType that differs from the API code", () => {
    const fields = buildEvsDiskPayloadFields({
      diskType: "SAS",
      diskSize: 40,
      labels: buildEvsPayloadLabels({ productType: "calc_2_" }),
      resourceSpecType: "High_IO",
      volumeType: "High I/O",
      productSpecSysDesc: "Disk Specifications:High I/O",
    });

    expect(fields).toMatchObject({
      resourceSpecCode: "SAS",
      resourceSpecType: "High_IO",
      volumeType: "High I/O",
      productSpecSysDesc: "Disk Specifications:High I/O",
      productType: "calc_2_",
      addToList_product: "calc_2_ | 40detail_42_",
    });
  });
});
