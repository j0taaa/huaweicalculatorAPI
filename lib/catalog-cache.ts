import "server-only";

import { getTemplateById, replayRequest } from "@/lib/postman";

export type CachedReplayResult = {
  endpoint: {
    id: string;
    name: string;
  };
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    bodyRaw: string | null;
    useCapturedAuth: boolean;
  };
  response: {
    ok: boolean;
    status: number;
    statusText: string;
    contentType: string;
    durationMs: number;
    body: unknown;
    rawTextPreview: string;
  };
  testedAt: string;
};

export type CatalogRegion = {
  id: string;
  name: string;
};

type CatalogCacheState = {
  started: boolean;
  refreshPromise: Promise<void> | null;
  refreshTimer: ReturnType<typeof setInterval> | null;
  regions: CatalogRegion[];
  regionErrors: Record<string, string>;
  entries: Record<string, CachedReplayResult>;
  lastRefreshStartedAt: string | null;
  lastRefreshCompletedAt: string | null;
};

const REGION_DISCOVERY_URL = "https://sa-brazil-1-console.huaweicloud.com/apiexplorer/new/v6/regions?product_short=ECS&api_name=ListFlavors";
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FETCH_CONCURRENCY = 6;

declare global {
  var __hwcCatalogCacheState: CatalogCacheState | undefined;
}

function getCacheState(): CatalogCacheState {
  if (!globalThis.__hwcCatalogCacheState) {
    globalThis.__hwcCatalogCacheState = {
      started: false,
      refreshPromise: null,
      refreshTimer: null,
      regions: [],
      regionErrors: {},
      entries: {},
      lastRefreshStartedAt: null,
      lastRefreshCompletedAt: null,
    };
  }

  return globalThis.__hwcCatalogCacheState;
}

async function fetchCatalogRegions(): Promise<CatalogRegion[]> {
  const response = await fetch(REGION_DISCOVERY_URL, {
    headers: {
      "X-Language": "en-us",
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Region discovery failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as {
    regions?: Array<{
      region_id?: string;
      name?: string;
    }>;
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

async function fetchCatalogForRegion(region: string): Promise<CachedReplayResult> {
  const template = getTemplateById("get-product-options-and-info");
  if (!template) {
    throw new Error("Catalog template is missing");
  }

  const url = new URL(template.url);
  url.searchParams.set("region", region);

  const result = await replayRequest({
    id: "get-product-options-and-info",
    url: url.toString(),
    useCapturedAuth: false,
  });

  if (!result.response.ok) {
    throw new Error(`Catalog request for ${region} failed: ${result.response.status}`);
  }

  return toCachedReplayResult(result);
}

async function runWithConcurrency<T>(
  items: string[],
  worker: (item: string) => Promise<T>,
): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: Math.min(FETCH_CONCURRENCY, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await worker(current);
    }
  });

  await Promise.all(workers);
}

async function refreshCatalogCache() {
  const state = getCacheState();
  if (state.refreshPromise) {
    return state.refreshPromise;
  }

  state.refreshPromise = (async () => {
    state.lastRefreshStartedAt = new Date().toISOString();

    const regions = await fetchCatalogRegions();
    state.regions = regions;

    const nextEntries = { ...state.entries };
    const nextErrors: Record<string, string> = {};

    await runWithConcurrency(regions.map((region) => region.id), async (regionId) => {
      try {
        nextEntries[regionId] = await fetchCatalogForRegion(regionId);
      } catch (error) {
        nextErrors[regionId] = error instanceof Error ? error.message : `Catalog refresh failed for ${regionId}`;
      }
    });

    state.entries = nextEntries;
    state.regionErrors = nextErrors;
    state.lastRefreshCompletedAt = new Date().toISOString();
  })().finally(() => {
    getCacheState().refreshPromise = null;
  });

  return state.refreshPromise;
}

export function startCatalogCacheScheduler() {
  const state = getCacheState();
  if (state.started) {
    return;
  }

  state.started = true;
  void refreshCatalogCache();

  state.refreshTimer = setInterval(() => {
    void refreshCatalogCache();
  }, REFRESH_INTERVAL_MS);

  state.refreshTimer.unref?.();
}

export async function getCatalogCacheSnapshot(region?: string) {
  startCatalogCacheScheduler();

  const state = getCacheState();
  if ((!region && !state.regions.length) || (region && !state.entries[region] && state.refreshPromise)) {
    await state.refreshPromise;
  }

  return {
    entry: region ? getCacheState().entries[region] ?? null : null,
    regions: getCacheState().regions,
    regionErrors: getCacheState().regionErrors,
    meta: {
      refreshIntervalMs: REFRESH_INTERVAL_MS,
      warming: Boolean(getCacheState().refreshPromise),
      lastRefreshStartedAt: getCacheState().lastRefreshStartedAt,
      lastRefreshCompletedAt: getCacheState().lastRefreshCompletedAt,
      cachedRegionCount: Object.keys(getCacheState().entries).length,
    },
  };
}
