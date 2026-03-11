import type { Ga4Dimension } from "@/lib/server/analytics/providers/ga4";
import { fetchGa4SingleDimension, listGa4Properties } from "@/lib/server/analytics/providers/ga4";
import type { SearchAnalyticsDimension } from "@/lib/server/analytics/providers/gsc";
import { fetchGscSingleDimension, listGscSites } from "@/lib/server/analytics/providers/gsc";

type JsonObject = Record<string, unknown>;

type ToolInputSchema = {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
};

export type McpTool = {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  execute: (input: JsonObject) => Promise<JsonObject>;
};

const GSC_DIMENSIONS: SearchAnalyticsDimension[] = ["query", "page", "date", "device", "country"];
const GA4_DIMENSIONS: Ga4Dimension[] = [
  "sessionSourceMedium",
  "landingPagePlusQueryString",
  "date",
  "deviceCategory",
  "country",
];

function formatDateAsIsoDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function parseDateRange(
  input: JsonObject,
  params: {
    endDateLagDays: number;
    defaultWindowDays: number;
  },
): { startDate: string; endDate: string } {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() - params.endDateLagDays);
  const endDate = typeof input.endDate === "string" && input.endDate ? input.endDate : formatDateAsIsoDay(now);

  const startBase = new Date(`${endDate}T00:00:00Z`);
  startBase.setUTCDate(startBase.getUTCDate() - params.defaultWindowDays + 1);
  const startDate =
    typeof input.startDate === "string" && input.startDate ? input.startDate : formatDateAsIsoDay(startBase);

  return { startDate, endDate };
}

function parseRowLimit(input: JsonObject, fallback = 10, max = 25000): number {
  const value = typeof input.rowLimit === "number" ? input.rowLimit : fallback;
  if (!Number.isInteger(value) || value <= 0) {
    return fallback;
  }
  return Math.min(value, max);
}

async function resolveGscSiteUrl(accessToken: string, siteUrl: string | undefined): Promise<string> {
  if (siteUrl) {
    return siteUrl;
  }

  const sites = await listGscSites(accessToken);
  const first = sites[0]?.siteUrl;
  if (!first) {
    throw new Error("gsc_site_not_found");
  }
  return first;
}

async function resolveGa4PropertyId(accessToken: string, propertyId: string | undefined): Promise<string> {
  if (propertyId) {
    return propertyId;
  }

  const properties = await listGa4Properties(accessToken);
  const first = properties[0]?.propertyId;
  if (!first) {
    throw new Error("ga4_property_not_found");
  }
  return first;
}

export function buildAnalyticsMcpTools(accessToken: string): McpTool[] {
  return [
    {
      name: "list_gsc_sites",
      description: "Google Search Consoleのサイト一覧を取得する。",
      inputSchema: {
        type: "object",
        properties: {},
      },
      execute: async () => {
        const sites = await listGscSites(accessToken);
        return {
          total: sites.length,
          sites,
        };
      },
    },
    {
      name: "get_gsc_search_analytics",
      description:
        "GSCの検索パフォーマンスを取得する。siteUrl未指定時は連携済みの先頭サイトを使う。",
      inputSchema: {
        type: "object",
        properties: {
          siteUrl: { type: "string" },
          dimension: { type: "string", enum: GSC_DIMENSIONS },
          startDate: { type: "string", description: "YYYY-MM-DD" },
          endDate: { type: "string", description: "YYYY-MM-DD" },
          rowLimit: { type: "integer", minimum: 1, maximum: 25000 },
        },
      },
      execute: async (input) => {
        const rawDimension = typeof input.dimension === "string" ? input.dimension : "query";
        const dimension = GSC_DIMENSIONS.includes(rawDimension as SearchAnalyticsDimension)
          ? (rawDimension as SearchAnalyticsDimension)
          : "query";

        const { startDate, endDate } = parseDateRange(input, {
          endDateLagDays: 3,
          defaultWindowDays: 30,
        });

        const siteUrl = await resolveGscSiteUrl(
          accessToken,
          typeof input.siteUrl === "string" ? input.siteUrl : undefined,
        );
        const rowLimit = parseRowLimit(input, 10, 25000);

        const rows = await fetchGscSingleDimension({
          accessToken,
          siteUrl,
          dimension,
          startDate,
          endDate,
          rowLimit,
        });

        return {
          provider: "gsc",
          siteUrl,
          dimension,
          startDate,
          endDate,
          rowLimit,
          total: rows.length,
          rows,
        };
      },
    },
    {
      name: "list_ga4_properties",
      description: "Google Analytics 4のプロパティ一覧を取得する。",
      inputSchema: {
        type: "object",
        properties: {},
      },
      execute: async () => {
        const properties = await listGa4Properties(accessToken);
        return {
          total: properties.length,
          properties,
        };
      },
    },
    {
      name: "get_ga4_report",
      description:
        "GA4レポートを取得する。propertyId未指定時は連携済みの先頭プロパティを使う。",
      inputSchema: {
        type: "object",
        properties: {
          propertyId: { type: "string" },
          dimension: { type: "string", enum: GA4_DIMENSIONS },
          startDate: { type: "string", description: "YYYY-MM-DD" },
          endDate: { type: "string", description: "YYYY-MM-DD" },
          rowLimit: { type: "integer", minimum: 1, maximum: 250000 },
        },
      },
      execute: async (input) => {
        const rawDimension = typeof input.dimension === "string" ? input.dimension : "sessionSourceMedium";
        const dimension = GA4_DIMENSIONS.includes(rawDimension as Ga4Dimension)
          ? (rawDimension as Ga4Dimension)
          : "sessionSourceMedium";

        const { startDate, endDate } = parseDateRange(input, {
          endDateLagDays: 1,
          defaultWindowDays: 30,
        });

        const propertyId = await resolveGa4PropertyId(
          accessToken,
          typeof input.propertyId === "string" ? input.propertyId : undefined,
        );
        const rowLimit = parseRowLimit(input, 10, 250000);

        const rows = await fetchGa4SingleDimension({
          accessToken,
          propertyId,
          dimension,
          startDate,
          endDate,
          rowLimit,
        });

        return {
          provider: "ga4",
          propertyId,
          dimension,
          startDate,
          endDate,
          rowLimit,
          total: rows.length,
          rows,
        };
      },
    },
  ];
}
