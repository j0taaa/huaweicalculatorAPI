import { describe, expect, test } from "bun:test";
import { normalizeHuaweiCookieInput } from "@/lib/huawei-session";

describe("normalizeHuaweiCookieInput", () => {
  test("wraps a bare HWS_INTL_ID token", () => {
    expect(normalizeHuaweiCookieInput("abc123")).toBe("HWS_INTL_ID=abc123");
  });

  test("keeps a direct HWS_INTL_ID cookie unchanged", () => {
    expect(normalizeHuaweiCookieInput("HWS_INTL_ID=abc123")).toBe("HWS_INTL_ID=abc123");
  });

  test("keeps a full cookie string unchanged", () => {
    const cookie = "vk=1; SessionID=2; HWS_INTL_ID=abc123; csrf=token";
    expect(normalizeHuaweiCookieInput(cookie)).toBe(cookie);
  });
});
