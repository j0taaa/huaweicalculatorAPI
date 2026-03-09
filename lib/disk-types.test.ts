import { describe, expect, test } from "bun:test";

import {
  DISK_TYPE_OPTIONS,
  getDiskTypeDisplayName,
  normalizeDiskTypeApiCode,
} from "@/lib/disk-types";

describe("disk type helpers", () => {
  test("normalizes every supported friendly disk label to the Huawei API code", () => {
    expect(
      DISK_TYPE_OPTIONS.map((option) => [option.label, normalizeDiskTypeApiCode(option.label)]),
    ).toEqual([
      ["Common I/O", "SATA"],
      ["High I/O", "SAS"],
      ["Ultra-high I/O", "SSD"],
      ["Extreme SSD", "ESSD"],
      ["General Purpose SSD", "GPSSD"],
      ["General Purpose SSD V2", "GPSSD2.storage"],
    ]);
  });

  test("accepts common disk type aliases and keeps API codes canonical", () => {
    expect(normalizeDiskTypeApiCode("SATA")).toBe("SATA");
    expect(normalizeDiskTypeApiCode("High-io")).toBe("SAS");
    expect(normalizeDiskTypeApiCode("Ultra High IO")).toBe("SSD");
    expect(normalizeDiskTypeApiCode("ESSD")).toBe("ESSD");
    expect(normalizeDiskTypeApiCode("GPSSD")).toBe("GPSSD");
    expect(normalizeDiskTypeApiCode("GPSSD2")).toBe("GPSSD2.storage");
    expect(normalizeDiskTypeApiCode("GPSSD2.storage")).toBe("GPSSD2.storage");
  });

  test("returns friendly display names from either API codes or user labels", () => {
    expect(getDiskTypeDisplayName("SATA")).toBe("Common I/O");
    expect(getDiskTypeDisplayName("High I/O")).toBe("High I/O");
    expect(getDiskTypeDisplayName("GPSSD")).toBe("General Purpose SSD");
    expect(getDiskTypeDisplayName("GPSSD2.storage")).toBe("General Purpose SSD V2");
  });
});
