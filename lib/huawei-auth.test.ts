import { describe, expect, test } from "bun:test";
import { detectHuaweiAuthIssue } from "@/lib/huawei-auth";

describe("detectHuaweiAuthIssue", () => {
  test("detects Huawei expired-session responses", () => {
    expect(detectHuaweiAuthIssue({
      status: 200,
      body: {
        exceptionId: "CBC.0101",
        descArgs: ["CBC.0101 user invalid"],
      },
    })).toEqual({
      code: "CBC.0101",
      message: "CBC.0101 user invalid",
    });
  });

  test("detects generic 401 responses", () => {
    expect(detectHuaweiAuthIssue({
      status: 401,
      body: {
        message: "Unauthorized",
      },
    })).toEqual({
      code: "401",
      message: "Unauthorized",
    });
  });

  test("ignores successful non-auth responses", () => {
    expect(detectHuaweiAuthIssue({
      status: 200,
      body: {
        retCode: "200",
        data: [],
      },
    })).toBeNull();
  });
});
