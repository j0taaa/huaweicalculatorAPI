import {
  getCatalogDisks,
  getCatalogFlavors,
  type ProductDisk,
  type ProductFlavor,
} from "@/lib/catalog";
import {
  clearCatalogRegionError,
  getCatalogDbMeta,
  hasAnyCatalogSnapshots,
  listCatalogRegionErrors,
  listCatalogRegions,
  readEcsVisibilityConfig,
  readCatalogRegionSnapshot,
  setCatalogMeta,
  setCatalogRegionError,
  writeCatalogRegionSnapshot,
  writeCatalogRegions,
  writeEcsVisibilityConfig,
  writeOnDemandDiskPrice,
  writeOnDemandFlavorPrice,
  type CachedReplayResult,
  type CatalogRegion,
} from "@/lib/catalog-db";
import { type EcsCalculatorVisibilityConfig } from "@/lib/catalog-config";
import { fetchEcsVisibilityConfig } from "@/lib/catalog-config-server";
import { getTemplateById, replayRequest } from "@/lib/postman";

const REGION_DISCOVERY_URL = "https://sa-brazil-1-console.huaweicloud.com/apiexplorer/new/v6/regions?product_short=ECS&api_name=ListFlavors";
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const CATALOG_FETCH_CONCURRENCY = 4;
const PRICE_REQUEST_DELAY_MS = 300;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchCatalogRegions(): Promise<CatalogRegion[]> {
  const response = await fetch(REGION_DISCOVERY_URL, {
    headers: { "X-Language": "en-us" },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Region discovery failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as {
    regions?: Array<{ region_id?: string; name?: string }>;
  };

  return (payload.regions ?? [])
    .map((region) => ({
      id: region.region_id?.trim() ?? "",
      name: region.name?.trim() || region.region_id?.trim() || "",
    }))
    .filter((region) => Boolean(region.id));
}

function toCachedReplayResult(result: Awaited<ReturnType<typeof replayRequest>>): CachedReplayResult {
  return {
    endpoint: {
      id: result.template.id,
      name: result.template.name,
    },
    request: result.request,
    response: result.response,
    testedAt: new Date().toISOString(),
  };
}

async function fetchCatalogForRegion(regionId: string): Promise<CachedReplayResult> {
  const template = getTemplateById("get-product-options-and-info");
  if (!template) {
    throw new Error("Catalog template is missing");
  }

  const url = new URL(template.url);
  url.searchParams.set("region", regionId);

  const result = await replayRequest({
    id: "get-product-options-and-info",
    url: url.toString(),
    useCapturedAuth: false,
  });

  if (!result.response.ok) {
    throw new Error(`Catalog request for ${regionId} failed: ${result.response.status}`);
  }

  return toCachedReplayResult(result);
}

async function runWithConcurrency<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
) {
  let index = 0;
  const workers = Array.from({ length: Math.min(CATALOG_FETCH_CONCURRENCY, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await worker(current);
    }
  });

  await Promise.all(workers);
}

function buildOnDemandPriceBody(regionId: string, flavor: ProductFlavor, disk: ProductDisk): string {
  const template = getTemplateById("get-price");
  if (!template || typeof template.bodyJson !== "object" || !template.bodyJson) {
    throw new Error("Get price template is missing");
  }

  const body = structuredClone(template.bodyJson as {
    regionId: string;
    chargingMode: number;
    periodType: number;
    periodNum: number;
    subscriptionNum: number;
    productInfos: Array<Record<string, unknown>>;
  });

  body.regionId = regionId;
  body.chargingMode = 1;
  body.periodType = 4;
  body.periodNum = 1;
  body.subscriptionNum = 1;

  const vm = body.productInfos[0] ?? {};
  vm.id = `${regionId}-${flavor.resourceSpecCode}-vm`;
  vm.cloudServiceType = flavor.cloudServiceType ?? "hws.service.type.ec2";
  vm.resourceType = flavor.resourceType ?? "hws.resource.type.vm";
  vm.resourceSpecCode = flavor.resourceSpecCode;
  vm.productNum = 1;
  vm.usageFactor = "Duration";
  vm.usageMeasureId = 4;
  vm.usageValue = 1;
  body.productInfos[0] = vm;

  const volume = body.productInfos[1] ?? {};
  volume.id = `${regionId}-${disk.resourceSpecCode}-disk`;
  volume.cloudServiceType = disk.cloudServiceType ?? "hws.service.type.ebs";
  volume.resourceType = disk.resourceType ?? "hws.resource.type.volume";
  volume.resourceSpecCode = disk.resourceSpecCode;
  volume.productNum = 1;
  volume.resourceSize = 1;
  volume.resouceSizeMeasureId = 17;
  volume.usageFactor = "Duration";
  volume.usageMeasureId = 4;
  volume.usageValue = 1;
  body.productInfos[1] = volume;

  return JSON.stringify(body);
}

async function syncOnDemandFlavorPrices(
  regionId: string,
  entry: CachedReplayResult,
  visibilityConfig?: EcsCalculatorVisibilityConfig,
) {
  const flavors = getCatalogFlavors(entry.response.body, visibilityConfig);
  const disks = getCatalogDisks(entry.response.body);
  const disk = disks.find((item) => item.resourceSpecCode === "GPSSD") ?? disks[0];
  const failures: string[] = [];

  if (!disk) {
    throw new Error(`No disk catalog entry available for ${regionId}`);
  }

  let storedDiskPrice = false;

  for (const flavor of flavors) {
    try {
      const result = await replayRequest({
        id: "get-price",
        bodyRaw: buildOnDemandPriceBody(regionId, flavor, disk),
        useCapturedAuth: false,
      });

      if (!result.response.ok) {
        throw new Error(`HTTP ${result.response.status}`);
      }

      const body = result.response.body as {
        currency?: string;
        productRatingResult?: Array<{ amount?: number }>;
      };

      const currency = body.currency ?? "USD";
      const vmAmount = body.productRatingResult?.[0]?.amount;
      if (typeof vmAmount !== "number" || !Number.isFinite(vmAmount)) {
        throw new Error("VM amount missing");
      }

      const syncedAt = new Date().toISOString();
      await writeOnDemandFlavorPrice(regionId, flavor.resourceSpecCode, vmAmount, currency, syncedAt);

      if (!storedDiskPrice) {
        const diskAmount = body.productRatingResult?.[1]?.amount;
        if (typeof diskAmount === "number" && Number.isFinite(diskAmount)) {
          await writeOnDemandDiskPrice(regionId, disk.resourceSpecCode, diskAmount, currency, syncedAt);
          storedDiskPrice = true;
        }
      }
    } catch (error) {
      failures.push(`${flavor.resourceSpecCode}: ${error instanceof Error ? error.message : "unknown error"}`);
    } finally {
      await sleep(PRICE_REQUEST_DELAY_MS);
    }
  }

  if (failures.length) {
    throw new Error(`Stored ${flavors.length - failures.length}/${flavors.length} on-demand prices for ${regionId}; last failure: ${failures.at(-1)}`);
  }
}

async function refreshCatalogDatabase() {
  const startedAt = new Date().toISOString();
  await setCatalogMeta("lastRefreshStartedAt", startedAt);

  let visibilityConfig = await readEcsVisibilityConfig() ?? undefined;
  try {
    visibilityConfig = await fetchEcsVisibilityConfig();
    await writeEcsVisibilityConfig(visibilityConfig);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.warn(`ECS visibility config refresh failed; using cached visibility rules if available: ${message}`);
  }

  const regions = await fetchCatalogRegions();
  await writeCatalogRegions(regions);

  await runWithConcurrency(regions, async (region) => {
    try {
      const entry = await fetchCatalogForRegion(region.id);
      await writeCatalogRegionSnapshot(region, entry);
      await clearCatalogRegionError(region.id);
    } catch (error) {
      await setCatalogRegionError(region.id, error instanceof Error ? error.message : `Catalog refresh failed for ${region.id}`);
    }
  });

  await setCatalogMeta("lastCatalogSweepCompletedAt", new Date().toISOString());

  for (const region of regions) {
    const entry = await readCatalogRegionSnapshot(region.id);
    if (!entry) {
      continue;
    }

    try {
      await syncOnDemandFlavorPrices(region.id, entry, visibilityConfig);
    } catch (error) {
      await setCatalogRegionError(region.id, error instanceof Error ? error.message : `Price sync failed for ${region.id}`);
    }
  }

  await setCatalogMeta("lastPriceSweepCompletedAt", new Date().toISOString());
  await setCatalogMeta("lastRefreshCompletedAt", new Date().toISOString());
}

async function readSnapshot(region?: string) {
  return {
    entry: region ? await readCatalogRegionSnapshot(region) : null,
    regions: await listCatalogRegions(),
    regionErrors: await listCatalogRegionErrors(),
    meta: await getCatalogDbMeta(REFRESH_INTERVAL_MS, false),
  };
}

async function main() {
  const command = process.argv[2];
  if (command === "refresh") {
    await refreshCatalogDatabase();
    return;
  }

  if (command === "snapshot") {
    const region = process.argv[3]?.trim() || undefined;
    if (!region && !(await hasAnyCatalogSnapshots())) {
      console.log(JSON.stringify(await readSnapshot()));
      return;
    }

    console.log(JSON.stringify(await readSnapshot(region)));
    return;
  }

  throw new Error(`Unknown catalog worker command: ${command ?? "missing"}`);
}

void main();
