import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  getCatalogDisks,
  getCatalogFlavors,
  getDiskBasePrice,
  getFlavorBasePrice,
  type CatalogPricingMode,
  type ProductDisk,
  type ProductFlavor,
} from "@/lib/catalog";
import type { EcsCalculatorVisibilityConfig } from "@/lib/catalog-config";

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

type CatalogDbMeta = {
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

type SqliteStatement<T = unknown, P extends Array<string | number | null> = Array<string | number | null>> = {
  get(...params: P): T | null;
  all(...params: P): T[];
  run(...params: P): unknown;
};

type SqliteDatabase = {
  exec(sql: string): void;
  query<T = unknown, P extends Array<string | number | null> = Array<string | number | null>>(sql: string): SqliteStatement<T, P>;
  transaction<TArgs extends unknown[]>(fn: (...args: TArgs) => void): (...args: TArgs) => void;
};

type SqliteDatabaseConstructor = new (filename?: string, options?: { create?: boolean }) => SqliteDatabase;

type MetaRow = { value: string };
type RegionRow = { region_id: string; name: string };
type SnapshotRow = { entry_json: string };
type ErrorRow = { region_id: string; message: string };
type CountRow = { count: number };
type CatalogPriceRow = {
  resource_spec_code: string;
  pricing_mode: CatalogPricingMode;
  amount: number;
};

const DEFAULT_DB_PATH = join(process.cwd(), "data", "catalog.db");
const PRICING_MODES: CatalogPricingMode[] = ["ONDEMAND", "MONTHLY", "YEARLY", "RI"];
const ECS_VISIBILITY_CONFIG_META_KEY = "ecsVisibilityConfig";

declare global {
  var __hwcCatalogDb: SqliteDatabase | undefined;
  var __hwcCatalogDbPromise: Promise<SqliteDatabase> | undefined;
}

function getDatabasePath(): string {
  return process.env.CATALOG_DB_PATH?.trim() || DEFAULT_DB_PATH;
}

async function loadSqliteDatabaseConstructor(): Promise<SqliteDatabaseConstructor> {
  const sqliteModule = await import("bun:sqlite");
  return sqliteModule.Database as SqliteDatabaseConstructor;
}

function initializeSchema(db: SqliteDatabase) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 10000;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS catalog_regions (
      region_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS catalog_region_snapshots (
      region_id TEXT PRIMARY KEY REFERENCES catalog_regions(region_id) ON DELETE CASCADE,
      entry_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS catalog_sync_errors (
      region_id TEXT PRIMARY KEY REFERENCES catalog_regions(region_id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS catalog_flavors (
      region_id TEXT NOT NULL REFERENCES catalog_regions(region_id) ON DELETE CASCADE,
      resource_spec_code TEXT NOT NULL,
      flavor_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (region_id, resource_spec_code)
    );

    CREATE TABLE IF NOT EXISTS catalog_disks (
      region_id TEXT NOT NULL REFERENCES catalog_regions(region_id) ON DELETE CASCADE,
      resource_spec_code TEXT NOT NULL,
      disk_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (region_id, resource_spec_code)
    );

    CREATE TABLE IF NOT EXISTS catalog_flavor_prices (
      region_id TEXT NOT NULL REFERENCES catalog_regions(region_id) ON DELETE CASCADE,
      resource_spec_code TEXT NOT NULL,
      pricing_mode TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      source TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (region_id, resource_spec_code, pricing_mode)
    );

    CREATE TABLE IF NOT EXISTS catalog_disk_prices (
      region_id TEXT NOT NULL REFERENCES catalog_regions(region_id) ON DELETE CASCADE,
      resource_spec_code TEXT NOT NULL,
      pricing_mode TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      source TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (region_id, resource_spec_code, pricing_mode)
    );
  `);
}

export async function getCatalogDatabase(): Promise<SqliteDatabase> {
  if (globalThis.__hwcCatalogDb) {
    return globalThis.__hwcCatalogDb;
  }

  if (!globalThis.__hwcCatalogDbPromise) {
    globalThis.__hwcCatalogDbPromise = (async () => {
      const dbPath = getDatabasePath();
      mkdirSync(dirname(dbPath), { recursive: true });
      const Database = await loadSqliteDatabaseConstructor();
      const db = new Database(dbPath, { create: true });
      initializeSchema(db);
      globalThis.__hwcCatalogDb = db;
      return db;
    })();
  }

  return globalThis.__hwcCatalogDbPromise;
}

async function getMeta(key: string): Promise<string | null> {
  const db = await getCatalogDatabase();
  const row = db.query<MetaRow, [string]>("SELECT value FROM app_meta WHERE key = ?").get(key);
  return row?.value ?? null;
}

export async function setCatalogMeta(key: string, value: string | null) {
  const db = await getCatalogDatabase();
  if (value === null) {
    db.query("DELETE FROM app_meta WHERE key = ?").run(key);
    return;
  }

  db.query(`
    INSERT INTO app_meta (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

export async function writeEcsVisibilityConfig(config: EcsCalculatorVisibilityConfig) {
  await setCatalogMeta(ECS_VISIBILITY_CONFIG_META_KEY, JSON.stringify(config));
}

export async function readEcsVisibilityConfig(): Promise<EcsCalculatorVisibilityConfig | null> {
  const raw = await getMeta(ECS_VISIBILITY_CONFIG_META_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as EcsCalculatorVisibilityConfig;
  } catch {
    return null;
  }
}

function toCatalogRegions(rows: RegionRow[]): CatalogRegion[] {
  return rows.map((row) => ({
    id: row.region_id,
    name: row.name,
  }));
}

function buildCatalogPriceMap(rows: CatalogPriceRow[]) {
  const priceMap = new Map<string, Partial<Record<CatalogPricingMode, number>>>();

  for (const row of rows) {
    const current = priceMap.get(row.resource_spec_code) ?? {};
    current[row.pricing_mode] = row.amount;
    priceMap.set(row.resource_spec_code, current);
  }

  return priceMap;
}

function ensureCatalogPlanAmount<T extends ProductFlavor | ProductDisk>(
  item: T,
  pricingMode: CatalogPricingMode,
  amount: number,
): T {
  const next = structuredClone(item);
  const planList = [...(next.planList ?? [])];
  const hasPlan = planList.some((plan) => plan.billingMode === pricingMode && typeof plan.amount === "number");

  if (!hasPlan) {
    if (pricingMode === "RI") {
      planList.push({
        billingMode: "RI",
        originType: "perPrice",
        amountType: "nodeData.perPrice",
        amount,
      });
    } else {
      planList.push({
        billingMode: pricingMode,
        amount,
      });
    }
  }

  next.planList = planList;
  if (pricingMode === "ONDEMAND") {
    next.amount = amount;
  }

  return next;
}

export function hydrateCatalogEntryPrices(
  entry: CachedReplayResult,
  flavorPriceRows: CatalogPriceRow[],
  diskPriceRows: CatalogPriceRow[],
): CachedReplayResult {
  const flavorPrices = buildCatalogPriceMap(flavorPriceRows);
  const diskPrices = buildCatalogPriceMap(diskPriceRows);
  const nextEntry = structuredClone(entry);
  const body = nextEntry.response.body as { product?: { ec2_vm?: ProductFlavor[]; ebs_volume?: ProductDisk[] } } | null;

  if (!body?.product) {
    return nextEntry;
  }

  if (Array.isArray(body.product.ec2_vm)) {
    body.product.ec2_vm = body.product.ec2_vm.map((flavor) => {
      const prices = flavorPrices.get(flavor.resourceSpecCode);
      if (!prices) {
        return flavor;
      }

      let nextFlavor = flavor;
      for (const pricingMode of PRICING_MODES) {
        const amount = prices[pricingMode];
        if (typeof amount === "number" && Number.isFinite(amount)) {
          nextFlavor = ensureCatalogPlanAmount(nextFlavor, pricingMode, amount);
        }
      }

      return nextFlavor;
    });
  }

  if (Array.isArray(body.product.ebs_volume)) {
    body.product.ebs_volume = body.product.ebs_volume.map((disk) => {
      const prices = diskPrices.get(disk.resourceSpecCode);
      if (!prices) {
        return disk;
      }

      let nextDisk = disk;
      for (const pricingMode of PRICING_MODES) {
        const amount = prices[pricingMode];
        if (typeof amount === "number" && Number.isFinite(amount)) {
          nextDisk = ensureCatalogPlanAmount(nextDisk, pricingMode, amount);
        }
      }

      return nextDisk;
    });
  }

  return nextEntry;
}

function getCatalogPlanPrices<T extends ProductFlavor | ProductDisk>(
  items: T[],
  getPrice: (item: T, pricingMode: CatalogPricingMode) => number,
) {
  const records: Array<{
    resourceSpecCode: string;
    pricingMode: CatalogPricingMode;
    amount: number;
  }> = [];

  for (const item of items) {
    const resourceSpecCode = item.resourceSpecCode.trim();
    if (!resourceSpecCode) {
      continue;
    }

    for (const pricingMode of PRICING_MODES) {
      const amount = getPrice(item, pricingMode);
      if (!Number.isFinite(amount)) {
        continue;
      }

      records.push({
        resourceSpecCode,
        pricingMode,
        amount,
      });
    }
  }

  return records;
}

export async function writeCatalogRegionSnapshot(region: CatalogRegion, entry: CachedReplayResult) {
  const db = await getCatalogDatabase();
  const now = new Date().toISOString();
  const visibilityConfig = await readEcsVisibilityConfig();
  const flavors = getCatalogFlavors(entry.response.body, visibilityConfig ?? undefined);
  const disks = getCatalogDisks(entry.response.body);
  const flavorPlanPrices = getCatalogPlanPrices(flavors, getFlavorBasePrice);
  const diskPlanPrices = getCatalogPlanPrices(disks, getDiskBasePrice);

  const transaction = db.transaction(() => {
    db.query(`
      INSERT INTO catalog_regions (region_id, name, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(region_id) DO UPDATE SET
        name = excluded.name,
        updated_at = excluded.updated_at
    `).run(region.id, region.name, now);

    db.query(`
      INSERT INTO catalog_region_snapshots (region_id, entry_json, fetched_at)
      VALUES (?, ?, ?)
      ON CONFLICT(region_id) DO UPDATE SET
        entry_json = excluded.entry_json,
        fetched_at = excluded.fetched_at
    `).run(region.id, JSON.stringify(entry), entry.testedAt);

    db.query("DELETE FROM catalog_sync_errors WHERE region_id = ?").run(region.id);
    db.query("DELETE FROM catalog_flavors WHERE region_id = ?").run(region.id);
    db.query("DELETE FROM catalog_disks WHERE region_id = ?").run(region.id);
    db.query("DELETE FROM catalog_flavor_prices WHERE region_id = ? AND source = 'catalog_plan'").run(region.id);
    db.query("DELETE FROM catalog_disk_prices WHERE region_id = ? AND source = 'catalog_plan'").run(region.id);

    const insertFlavor = db.query(`
      INSERT INTO catalog_flavors (region_id, resource_spec_code, flavor_json, updated_at)
      VALUES (?, ?, ?, ?)
    `);
    for (const flavor of flavors) {
      insertFlavor.run(region.id, flavor.resourceSpecCode.trim(), JSON.stringify(flavor), now);
    }

    const insertDisk = db.query(`
      INSERT INTO catalog_disks (region_id, resource_spec_code, disk_json, updated_at)
      VALUES (?, ?, ?, ?)
    `);
    for (const disk of disks) {
      insertDisk.run(region.id, disk.resourceSpecCode.trim(), JSON.stringify(disk), now);
    }

    const insertFlavorPrice = db.query(`
      INSERT INTO catalog_flavor_prices (region_id, resource_spec_code, pricing_mode, amount, currency, source, updated_at)
      VALUES (?, ?, ?, ?, 'USD', 'catalog_plan', ?)
      ON CONFLICT(region_id, resource_spec_code, pricing_mode) DO UPDATE SET
        amount = excluded.amount,
        currency = excluded.currency,
        source = excluded.source,
        updated_at = excluded.updated_at
    `);
    for (const price of flavorPlanPrices) {
      insertFlavorPrice.run(region.id, price.resourceSpecCode, price.pricingMode, price.amount, now);
    }

    const insertDiskPrice = db.query(`
      INSERT INTO catalog_disk_prices (region_id, resource_spec_code, pricing_mode, amount, currency, source, updated_at)
      VALUES (?, ?, ?, ?, 'USD', 'catalog_plan', ?)
      ON CONFLICT(region_id, resource_spec_code, pricing_mode) DO UPDATE SET
        amount = excluded.amount,
        currency = excluded.currency,
        source = excluded.source,
        updated_at = excluded.updated_at
    `);
    for (const price of diskPlanPrices) {
      insertDiskPrice.run(region.id, price.resourceSpecCode, price.pricingMode, price.amount, now);
    }
  });

  transaction();
}

export async function writeCatalogRegions(regions: CatalogRegion[]) {
  const db = await getCatalogDatabase();
  const now = new Date().toISOString();
  const transaction = db.transaction(() => {
    const upsert = db.query(`
      INSERT INTO catalog_regions (region_id, name, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(region_id) DO UPDATE SET
        name = excluded.name,
        updated_at = excluded.updated_at
    `);

    for (const region of regions) {
      upsert.run(region.id, region.name, now);
    }
  });

  transaction();
}

export async function writeOnDemandFlavorPrice(
  regionId: string,
  flavorCode: string,
  amount: number,
  currency: string,
  syncedAt: string,
) {
  const db = await getCatalogDatabase();
  db.query(`
    INSERT INTO catalog_flavor_prices (region_id, resource_spec_code, pricing_mode, amount, currency, source, updated_at)
    VALUES (?, ?, 'ONDEMAND', ?, ?, 'price_api', ?)
    ON CONFLICT(region_id, resource_spec_code, pricing_mode) DO UPDATE SET
      amount = excluded.amount,
      currency = excluded.currency,
      source = excluded.source,
      updated_at = excluded.updated_at
  `).run(regionId, flavorCode, amount, currency, syncedAt);
}

export async function writeOnDemandDiskPrice(
  regionId: string,
  diskCode: string,
  amount: number,
  currency: string,
  syncedAt: string,
) {
  const db = await getCatalogDatabase();
  db.query(`
    INSERT INTO catalog_disk_prices (region_id, resource_spec_code, pricing_mode, amount, currency, source, updated_at)
    VALUES (?, ?, 'ONDEMAND', ?, ?, 'price_api', ?)
    ON CONFLICT(region_id, resource_spec_code, pricing_mode) DO UPDATE SET
      amount = excluded.amount,
      currency = excluded.currency,
      source = excluded.source,
      updated_at = excluded.updated_at
  `).run(regionId, diskCode, amount, currency, syncedAt);
}

export async function setCatalogRegionError(regionId: string, message: string) {
  const db = await getCatalogDatabase();
  const now = new Date().toISOString();
  db.query(`
    INSERT INTO catalog_sync_errors (region_id, message, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(region_id) DO UPDATE SET
      message = excluded.message,
      updated_at = excluded.updated_at
  `).run(regionId, message, now);
}

export async function clearCatalogRegionError(regionId: string) {
  const db = await getCatalogDatabase();
  db.query("DELETE FROM catalog_sync_errors WHERE region_id = ?").run(regionId);
}

export async function listCatalogRegions(): Promise<CatalogRegion[]> {
  const db = await getCatalogDatabase();
  const rows = db.query<RegionRow, []>("SELECT region_id, name FROM catalog_regions ORDER BY region_id ASC").all();
  return toCatalogRegions(rows);
}

export async function listCatalogRegionErrors(): Promise<Record<string, string>> {
  const db = await getCatalogDatabase();
  const rows = db.query<ErrorRow, []>("SELECT region_id, message FROM catalog_sync_errors").all();
  return Object.fromEntries(rows.map((row) => [row.region_id, row.message]));
}

export async function readCatalogRegionSnapshot(regionId: string): Promise<CachedReplayResult | null> {
  const db = await getCatalogDatabase();
  const row = db.query<SnapshotRow, [string]>("SELECT entry_json FROM catalog_region_snapshots WHERE region_id = ?").get(regionId);
  if (!row) {
    return null;
  }

  const entry = JSON.parse(row.entry_json) as CachedReplayResult;
  const flavorPriceRows = db.query<CatalogPriceRow, [string]>(`
    SELECT resource_spec_code, pricing_mode, amount
    FROM catalog_flavor_prices
    WHERE region_id = ?
  `).all(regionId);
  const diskPriceRows = db.query<CatalogPriceRow, [string]>(`
    SELECT resource_spec_code, pricing_mode, amount
    FROM catalog_disk_prices
    WHERE region_id = ?
  `).all(regionId);
  const hydratedEntry = hydrateCatalogEntryPrices(entry, flavorPriceRows, diskPriceRows);
  const visibilityConfig = await readEcsVisibilityConfig();
  const body = hydratedEntry.response.body as { product?: { ec2_vm?: ProductFlavor[] } } | null;
  if (body?.product) {
    body.product.ec2_vm = getCatalogFlavors(body, visibilityConfig);
  }

  return hydratedEntry;
}

export async function hasAnyCatalogSnapshots(): Promise<boolean> {
  const db = await getCatalogDatabase();
  const row = db.query<CountRow, []>("SELECT COUNT(*) as count FROM catalog_region_snapshots").get();
  return (row?.count ?? 0) > 0;
}

export async function getCatalogDbMeta(refreshIntervalMs: number, warming: boolean): Promise<CatalogDbMeta> {
  const db = await getCatalogDatabase();
  const snapshotCount = db.query<CountRow, []>("SELECT COUNT(*) as count FROM catalog_region_snapshots").get()?.count ?? 0;
  const flavorCount = db.query<CountRow, []>("SELECT COUNT(*) as count FROM catalog_flavors").get()?.count ?? 0;
  const diskCount = db.query<CountRow, []>("SELECT COUNT(*) as count FROM catalog_disks").get()?.count ?? 0;
  const flavorPriceCount = db.query<CountRow, []>("SELECT COUNT(*) as count FROM catalog_flavor_prices").get()?.count ?? 0;
  const diskPriceCount = db.query<CountRow, []>("SELECT COUNT(*) as count FROM catalog_disk_prices").get()?.count ?? 0;

  return {
    refreshIntervalMs,
    warming,
    lastRefreshStartedAt: await getMeta("lastRefreshStartedAt"),
    lastRefreshCompletedAt: await getMeta("lastRefreshCompletedAt"),
    lastCatalogSweepCompletedAt: await getMeta("lastCatalogSweepCompletedAt"),
    lastPriceSweepCompletedAt: await getMeta("lastPriceSweepCompletedAt"),
    cachedRegionCount: snapshotCount,
    storedFlavorCount: flavorCount,
    storedDiskCount: diskCount,
    storedFlavorPriceCount: flavorPriceCount,
    storedDiskPriceCount: diskPriceCount,
    dbPath: getDatabasePath(),
  };
}
