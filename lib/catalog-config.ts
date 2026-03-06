import type { ProductFlavor } from "@/lib/catalog";

export const ECS_CONFIG_URL = "https://portal-intl.huaweicloud.com/api/calculator/rest/cbc/portalcalculatornodeservice/v4/api/config?urlPath=ecs&tag=general.online.portal&tab=detail&sign=common";

export type EcsCalculatorVisibilityConfig = {
  allowedGenerations: string[];
};

export function extractEcsVisibilityConfig(scriptText: string): EcsCalculatorVisibilityConfig {
  const componentStart = scriptText.search(/id:\s*['"]calculator_ecs_radio['"]/);
  if (componentStart === -1) {
    return { allowedGenerations: [] };
  }

  const componentSlice = scriptText.slice(componentStart);
  const match = componentSlice.match(/sortMethods:\s*\{[\s\S]*?\b2:\s*\[([\s\S]*?)\][\s\S]*?\}/);
  if (!match) {
    return { allowedGenerations: [] };
  }

  const arrayText = match[1].replace(/\/\/.*$/gm, "");
  const allowedGenerations = [...arrayText.matchAll(/'([^']+)'/g)]
    .map((item) => item[1]?.trim() ?? "")
    .filter((item) => Boolean(item))
    .filter((item) => !/^(dataInfo_|calc_|detail_)/.test(item))
    .filter((item) => /^[A-Za-z0-9]+[A-Za-z0-9]*$/.test(item));

  return {
    allowedGenerations: [...new Set(allowedGenerations)],
  };
}

export async function fetchEcsVisibilityConfig(): Promise<EcsCalculatorVisibilityConfig> {
  const response = await fetch(ECS_CONFIG_URL, {
    headers: { "X-Language": "en-us" },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`ECS config request failed: ${response.status} ${response.statusText}`);
  }

  return extractEcsVisibilityConfig(await response.text());
}

export function getFlavorGeneration(flavor: ProductFlavor): string {
  const fromField = typeof flavor.generation === "string" ? flavor.generation.trim() : "";
  if (fromField) {
    return fromField;
  }

  const code = typeof flavor.resourceSpecCode === "string" ? flavor.resourceSpecCode.trim() : "";
  const [prefix] = code.split(".", 1);
  return prefix ? prefix.charAt(0).toUpperCase() + prefix.slice(1) : "";
}
