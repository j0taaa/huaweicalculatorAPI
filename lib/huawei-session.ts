export function normalizeHuaweiCookieInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }

  if (!trimmed.includes("=") && !trimmed.includes(";")) {
    return `HWS_INTL_ID=${trimmed}`;
  }

  return trimmed;
}
