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
    const fields = buildEvsDiskPayloadFields(
      "General Purpose SSD V2",
      80,
      buildEvsPayloadLabels(),
    );

    expect(fields).toMatchObject({
      resourceSpecCode: "GPSSD2.storage",
      resourceSpecType: "GPSSD2.storage",
      volumeType: "General Purpose SSD V2",
      productSpecSysDesc: "Disk Specifications:General Purpose SSD V2",
      productType: "calc_7_",
      resourceMeasureName: "detail_42_",
      resourceMeasurePluralName: "detail_42_",
      addToList_title: "calc_4_",
      addToList_product: "calc_7_ | 80detail_42_",
    });
  });
});
