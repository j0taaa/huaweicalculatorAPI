import { NextRequest, NextResponse } from "next/server";
import { getCatalogCacheSnapshot } from "@/lib/catalog-cache";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const region = request.nextUrl.searchParams.get("region")?.trim() ?? "";
    const snapshot = await getCatalogCacheSnapshot(region || undefined);

    if (!region) {
      return NextResponse.json({
        cache: snapshot.meta,
        regions: snapshot.regions,
        regionErrors: snapshot.regionErrors,
      });
    }

    if (!snapshot.entry) {
      return NextResponse.json(
        {
          error: snapshot.regionErrors[region] ?? `No cached catalog for region ${region}`,
          cache: snapshot.meta,
          regions: snapshot.regions,
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ...snapshot.entry,
      cache: {
        ...snapshot.meta,
        source: "startup-catalog-cache",
        region,
      },
      regions: snapshot.regions,
      regionErrors: snapshot.regionErrors,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Catalog cache lookup failed",
      },
      { status: 500 },
    );
  }
}
