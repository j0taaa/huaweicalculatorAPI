export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { startCatalogCacheScheduler } = await import("@/lib/catalog-cache");
  startCatalogCacheScheduler();
}
