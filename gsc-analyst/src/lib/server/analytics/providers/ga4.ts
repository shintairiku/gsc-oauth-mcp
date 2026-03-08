import type { AnalyticsDataset, GoogleApiError, NormalizedAnalyticsRow } from "@/lib/analytics/types";

export type Ga4PropertyItem = {
  propertyId: string;
  displayName: string;
  account: string;
};

type Ga4Dimension = "sessionSourceMedium" | "landingPagePlusQueryString" | "date" | "deviceCategory" | "country";
export type { Ga4Dimension };

type RunReportResponse = {
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: string }>;
  }>;
};

async function runReport(params: {
  accessToken: string;
  propertyId: string;
  startDate: string;
  endDate: string;
  rowLimit: number;
  dimension: Ga4Dimension;
}): Promise<RunReportResponse> {
  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(params.propertyId)}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: params.startDate, endDate: params.endDate }],
        dimensions: [{ name: params.dimension }],
        metrics: [
          { name: "sessions" },
          { name: "totalUsers" },
          { name: "newUsers" },
          { name: "engagedSessions" },
          { name: "conversions" },
          { name: "bounceRate" },
          { name: "averageSessionDuration" },
        ],
        limit: params.rowLimit,
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(`GA4 runReport failed: ${response.status} ${errorText}`) as GoogleApiError;
    error.status = response.status;
    throw error;
  }

  return (await response.json()) as RunReportResponse;
}

function toNumber(value: string | undefined): number {
  const parsed = Number(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeRows(rows: RunReportResponse["rows"]): NormalizedAnalyticsRow[] {
  return (
    rows?.map((row) => {
      const metrics = row.metricValues ?? [];
      return {
        key: row.dimensionValues?.[0]?.value ?? "",
        metrics: {
          sessions: toNumber(metrics[0]?.value),
          totalUsers: toNumber(metrics[1]?.value),
          newUsers: toNumber(metrics[2]?.value),
          engagedSessions: toNumber(metrics[3]?.value),
          conversions: toNumber(metrics[4]?.value),
          bounceRate: toNumber(metrics[5]?.value),
          averageSessionDuration: toNumber(metrics[6]?.value),
        },
      };
    }) ?? []
  );
}

export async function listGa4Properties(accessToken: string): Promise<Ga4PropertyItem[]> {
  const response = await fetch("https://analyticsadmin.googleapis.com/v1alpha/accountSummaries?pageSize=200", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GA4 properties fetch failed: ${response.status} ${errorText}`);
  }

  const payload = (await response.json()) as {
    accountSummaries?: Array<{
      displayName?: string;
      propertySummaries?: Array<{
        property?: string;
        displayName?: string;
      }>;
    }>;
  };

  const properties: Ga4PropertyItem[] = [];
  for (const account of payload.accountSummaries ?? []) {
    for (const property of account.propertySummaries ?? []) {
      const propertyName = property.property ?? "";
      const propertyId = propertyName.split("/")[1] ?? "";
      if (!propertyId) {
        continue;
      }
      properties.push({
        propertyId,
        displayName: property.displayName ?? propertyId,
        account: account.displayName ?? "",
      });
    }
  }

  return properties;
}

export async function fetchGa4Datasets(params: {
  accessToken: string;
  propertyId: string;
  startDate: string;
  endDate: string;
  rowLimit: number;
}): Promise<AnalyticsDataset[]> {
  const { accessToken, propertyId, startDate, endDate, rowLimit } = params;

  const dimensionConfigs: Array<{ dimension: Ga4Dimension; rowLimit: number }> = [
    { dimension: "sessionSourceMedium", rowLimit: Math.min(rowLimit, 10) },
    { dimension: "landingPagePlusQueryString", rowLimit: Math.min(rowLimit, 10) },
    { dimension: "date", rowLimit: 30 },
    { dimension: "deviceCategory", rowLimit: 10 },
    { dimension: "country", rowLimit: 10 },
  ];

  const reports = await Promise.all(
    dimensionConfigs.map(async (config) => {
      const raw = await runReport({
        accessToken,
        propertyId,
        startDate,
        endDate,
        rowLimit: config.rowLimit,
        dimension: config.dimension,
      });
      return {
        name: config.dimension,
        rows: normalizeRows(raw.rows),
      } as AnalyticsDataset;
    }),
  );

  return reports;
}

export async function fetchGa4SingleDimension(params: {
  accessToken: string;
  propertyId: string;
  startDate: string;
  endDate: string;
  rowLimit: number;
  dimension: Ga4Dimension;
}): Promise<NormalizedAnalyticsRow[]> {
  const raw = await runReport(params);
  return normalizeRows(raw.rows);
}
