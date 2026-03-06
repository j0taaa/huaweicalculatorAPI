export type HuaweiAuthIssue = {
  code: string;
  message: string;
};

function extractAuthCode(body: unknown): string {
  if (!body || typeof body !== "object") {
    return "";
  }

  const exceptionId = (body as { exceptionId?: unknown }).exceptionId;
  if (typeof exceptionId === "string" && exceptionId.trim()) {
    return exceptionId.trim();
  }

  const retCode = (body as { retCode?: unknown }).retCode;
  if (typeof retCode === "string" && retCode.trim()) {
    return retCode.trim();
  }

  return "";
}

function extractAuthMessage(body: unknown): string {
  if (!body || typeof body !== "object") {
    return "";
  }

  const descArgs = (body as { descArgs?: unknown }).descArgs;
  if (Array.isArray(descArgs)) {
    const firstText = descArgs.find((value) => typeof value === "string" && value.trim());
    if (typeof firstText === "string") {
      return firstText.trim();
    }
  }

  const message = (body as { message?: unknown }).message;
  if (typeof message === "string" && message.trim()) {
    return message.trim();
  }

  const retMsg = (body as { retMsg?: unknown }).retMsg;
  if (typeof retMsg === "string" && retMsg.trim()) {
    return retMsg.trim();
  }

  return "";
}

export function detectHuaweiAuthIssue(response: {
  status: number;
  body: unknown;
}): HuaweiAuthIssue | null {
  const code = extractAuthCode(response.body);
  const rawMessage = extractAuthMessage(response.body);
  const normalizedMessage = rawMessage.toLowerCase();
  const looksExpired = (
    code === "CBC.0101"
    || code === "401"
    || response.status === 401
    || response.status === 403
    || normalizedMessage.includes("user invalid")
    || normalizedMessage.includes("session")
    || normalizedMessage.includes("login")
    || normalizedMessage.includes("expired")
    || normalizedMessage.includes("unauthorized")
    || normalizedMessage.includes("invalid token")
  );

  if (!looksExpired) {
    return null;
  }

  return {
    code: code || String(response.status),
    message: rawMessage || "Huawei session expired or is no longer valid",
  };
}
