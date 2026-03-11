import { describe, expect, test } from "bun:test";
import { detectHuaweiAccessIssue, detectHuaweiAuthIssue } from "@/lib/huawei-auth";

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

  test("does not treat openresty 403 pages as expired sessions", () => {
    expect(detectHuaweiAuthIssue({
      status: 403,
      body: "<html><center><h1>403 Forbidden</h1></center><center>openresty</center><p>Forbid_code: 020100</p></html>",
    })).toBeNull();
  });
});

describe("detectHuaweiAccessIssue", () => {
  test("detects Huawei edge blocks", () => {
    expect(detectHuaweiAccessIssue({
      status: 403,
      body: "<html><center><h1>403 Forbidden</h1></center><center>openresty</center><p>Forbid_code: 020100</p></html>",
      rawTextPreview: "<html><center><h1>403 Forbidden</h1></center><center>openresty</center><p>Forbid_code: 020100</p></html>",
    })).toEqual({
      code: "020100",
      message: "Huawei blocked the request at the edge before session validation. The cookie may still be valid, but the server request was rejected.",
    });
  });
});
