import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CachedReplayResult, CatalogRegion } from "@/lib/catalog-db";

const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const execFileAsync = promisify(execFile);

type CatalogCacheMeta = {
  refreshIntervalMs: number;
  warming: boolean;
  lastRefreshStartedAt: string | null;
  lastRefreshCompletedAt: string | null;
  lastCatalogSweepCompletedAt: string | null;
  lastPriceSweepCompletedAt: string | null;
  cachedRegionCount: number;
  storedFlavorCount: number;
  storedDiskCount: number;
  storedFlavorPriceCount: number;
  storedDiskPriceCount: number;
  dbPath: string;
};

type CatalogSnapshot = {
  entry: CachedReplayResult | null;
  regions: CatalogRegion[];
  regionErrors: Record<string, string>;
  meta: CatalogCacheMeta;
};

type CatalogCacheState = {
  started: boolean;
  syncPromise: Promise<void> | null;
  refreshTimer: ReturnType<typeof setInterval> | null;
};

declare global {
  var __hwcCatalogCacheState: CatalogCacheState | undefined;
}

function getCacheState(): CatalogCacheState {
  if (!globalThis.__hwcCatalogCacheState) {
    globalThis.__hwcCatalogCacheState = {
      started: false,
      syncPromise: null,
      refreshTimer: null,
    };
  }

  return globalThis.__hwcCatalogCacheState;
}

async function runCatalogWorker(args: string[]): Promise<string> {
  const result = await execFileAsync("bun", ["run", "scripts/catalog-worker.ts", ...args], {
    cwd: process.cwd(),
    maxBuffer: 10 * 1024 * 1024,
  });

  return result.stdout.trim();
}

async function readCatalogSnapshot(region?: string): Promise<CatalogSnapshot> {
  const stdout = await runCatalogWorker(["snapshot", region ?? ""]);
  return JSON.parse(stdout || "{}") as CatalogSnapshot;
}

async function refreshCatalogDatabase() {
  const state = getCacheState();
  if (state.syncPromise) {
    return state.syncPromise;
  }

  state.syncPromise = runCatalogWorker(["refresh"])
    .then(() => undefined)
    .finally(() => {
      getCacheState().syncPromise = null;
    });

  return state.syncPromise;
}

export function startCatalogCacheScheduler() {
  const state = getCacheState();
  if (state.started) {
    return;
  }

  state.started = true;
  void refreshCatalogDatabase();

  state.refreshTimer = setInterval(() => {
    void refreshCatalogDatabase();
  }, REFRESH_INTERVAL_MS);

  state.refreshTimer.unref?.();
}

export async function getCatalogCacheSnapshot(region?: string) {
  startCatalogCacheScheduler();

  let snapshot = await readCatalogSnapshot(region);
  if ((!region && !snapshot.meta?.cachedRegionCount) || (region && !snapshot.entry && getCacheState().syncPromise)) {
    await getCacheState().syncPromise;
    snapshot = await readCatalogSnapshot(region);
  }

  return snapshot;
}
