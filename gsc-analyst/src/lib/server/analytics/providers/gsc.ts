import type { AnalyticsDataset, GoogleApiError, NormalizedAnalyticsRow } from "@/lib/analytics/types";

export type GscSiteItem = {
  siteUrl: string;
  permissionLevel: string;
};

type GscSearchAnalyticsRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

type GscSearchAnalyticsResponse = {
  rows?: GscSearchAnalyticsRow[];
};

export type SearchAnalyticsDimension = "query" | "page" | "date" | "device" | "country";

async function fetchSearchAnalytics(
  accessToken: string,
  params: {
    siteUrl: string;
    dimension: SearchAnalyticsDimension;
    startDate: string;
    endDate: string;
    rowLimit: number;
  },
): Promise<GscSearchAnalyticsResponse> {
  const url = new URL(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(params.siteUrl)}/searchAnalytics/query`,
  );

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      startDate: params.startDate,
      endDate: params.endDate,
      dimensions: [params.dimension],
      rowLimit: params.rowLimit,
      dataState: "final",
      aggregationType: "auto",
      startRow: 0,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(
      `Google search analytics fetch failed: ${response.status} ${errorText}`,
    ) as GoogleApiError;
    error.status = response.status;
    throw error;
  }

  return (await response.json()) as GscSearchAnalyticsResponse;
}

function normalizeRows(rows: GscSearchAnalyticsRow[] | undefined): NormalizedAnalyticsRow[] {
  return (
    rows?.map((row) => ({
      key: row.keys?.[0] ?? "",
      metrics: {
        clicks: row.clicks ?? 0,
        impressions: row.impressions ?? 0,
        ctr: row.ctr ?? 0,
        position: row.position ?? 0,
      },
    })) ?? []
  );
}

export async function listGscSites(accessToken: string): Promise<GscSiteItem[]> {
  const response = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google sites fetch failed: ${response.status} ${errorText}`);
  }

  const payload = (await response.json()) as {
    siteEntry?: Array<{
      siteUrl: string;
      permissionLevel: string;
    }>;
  };

  return (
    payload.siteEntry?.map((site) => ({
      siteUrl: site.siteUrl,
      permissionLevel: site.permissionLevel,
    })) ?? []
  );
}

export async function fetchGscDatasets(params: {
  accessToken: string;
  siteUrl: string;
  startDate: string;
  endDate: string;
  rowLimit: number;
}): Promise<AnalyticsDataset[]> {
  const { accessToken, siteUrl, startDate, endDate, rowLimit } = params;

  const dimensionConfigs: Array<{ dimension: SearchAnalyticsDimension; rowLimit: number }> = [
    { dimension: "query", rowLimit: Math.min(rowLimit, 10) },
    { dimension: "page", rowLimit: Math.min(rowLimit, 10) },
    { dimension: "date", rowLimit: 30 },
    { dimension: "device", rowLimit: 10 },
    { dimension: "country", rowLimit: 10 },
  ];

  const results = await Promise.all(
    dimensionConfigs.map(async (config) => {
      const raw = await fetchSearchAnalytics(accessToken, {
        siteUrl,
        startDate,
        endDate,
        dimension: config.dimension,
        rowLimit: config.rowLimit,
      });

      return {
        name: config.dimension,
        rows: normalizeRows(raw.rows),
      } as AnalyticsDataset;
    }),
  );

  return results;
}

export async function fetchGscSingleDimension(params: {
  accessToken: string;
  siteUrl: string;
  dimension: SearchAnalyticsDimension;
  startDate: string;
  endDate: string;
  rowLimit: number;
}): Promise<NormalizedAnalyticsRow[]> {
  const raw = await fetchSearchAnalytics(params.accessToken, params);
  return normalizeRows(raw.rows);
}
