import { ECS_CONFIG_URL, extractEcsVisibilityConfig, type EcsCalculatorVisibilityConfig } from "@/lib/catalog-config";
import { sendHttpRequest } from "@/lib/huawei-http";

export async function fetchEcsVisibilityConfig(): Promise<EcsCalculatorVisibilityConfig> {
  const response = await sendHttpRequest({
    method: "GET",
    url: ECS_CONFIG_URL,
    headers: { "X-Language": "en-us" },
    timeoutMs: 30_000,
  });

  if (!response.ok) {
    throw new Error(`ECS config request failed: ${response.status} ${response.statusText}`);
  }

  return extractEcsVisibilityConfig(response.bodyText);
}
