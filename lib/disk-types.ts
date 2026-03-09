export const DISK_TYPE_OPTIONS = [
  { apiCode: "SATA", label: "Common I/O" },
  { apiCode: "SAS", label: "High I/O" },
  { apiCode: "SSD", label: "Ultra-high I/O" },
  { apiCode: "ESSD", label: "Extreme SSD" },
  { apiCode: "GPSSD", label: "General Purpose SSD" },
  { apiCode: "GPSSD2.storage", label: "General Purpose SSD V2" },
] as const;

export const DISK_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  DISK_TYPE_OPTIONS.map((option) => [option.apiCode, option.label]),
);

function normalizeLookupKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const DISK_TYPE_ALIASES: Record<string, string> = {
  commonio: "SATA",
  highio: "SAS",
  ultrahighio: "SSD",
  extremessd: "ESSD",
  generalpurposessd: "GPSSD",
  generalpurposessdv2: "GPSSD2.storage",
  gpssd2: "GPSSD2.storage",
};

const DISK_TYPE_LOOKUP: Record<string, string> = {
  ...Object.fromEntries(
    DISK_TYPE_OPTIONS.flatMap((option) => ([
      [normalizeLookupKey(option.apiCode), option.apiCode],
      [normalizeLookupKey(option.label), option.apiCode],
    ])),
  ),
  ...DISK_TYPE_ALIASES,
};

export function normalizeDiskTypeApiCode(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return DISK_TYPE_LOOKUP[normalizeLookupKey(trimmed)] ?? trimmed;
}

export function getDiskTypeDisplayName(value: string): string {
  const apiCode = normalizeDiskTypeApiCode(value);
  return DISK_TYPE_LABELS[apiCode] ?? value.trim();
}
