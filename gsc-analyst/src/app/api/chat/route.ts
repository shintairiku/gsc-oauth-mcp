import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type {
  AnalyticsDataset,
  AnalyticsProvider,
  GoogleApiError,
} from "@/lib/analytics/types";
import { getRequiredEnv } from "@/lib/server/env";
import { fetchGa4Datasets } from "@/lib/server/analytics/providers/ga4";
import { fetchGscDatasets, fetchGscSingleDimension } from "@/lib/server/analytics/providers/gsc";
import {
  getProviderLabel,
  getProviderSystemPrompt,
  parseAnalyticsProvider,
} from "@/lib/server/analytics/provider";
import { getGoogleTokenFromSupabase, withRefreshedGoogleAccessToken } from "@/lib/server/google/token";

type ClaudeMessageResponse = {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
};

type SearchAnalyticsDimension = "query" | "page" | "date" | "device" | "country";

type ChatRequestBody = {
  provider?: AnalyticsProvider;
  siteUrl?: string;
  propertyId?: string;
  message?: string;
  dimension?: SearchAnalyticsDimension;
  startDate?: string;
  endDate?: string;
  rowLimit?: number;
};

type ParsedBaseRequest = {
  provider: AnalyticsProvider;
  targetId: string;
  startDate: string;
  endDate: string;
  rowLimit: number;
};

type ParsedAnalyticsRequest = ParsedBaseRequest & {
  dimension: SearchAnalyticsDimension;
};

type ParsedChatRequest = ParsedBaseRequest & {
  message: string;
};

const DEFAULT_ROW_LIMIT = 10;
const MAX_ROW_LIMIT = 25000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_DIMENSIONS: SearchAnalyticsDimension[] = ["query", "page", "date", "device", "country"];

function formatDateAsIsoDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function isValidIsoDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed);
}

function parseBaseRequest(body: ChatRequestBody): ParsedBaseRequest {
  const provider = parseAnalyticsProvider(body.provider);

  const targetId = provider === "ga4" ? body.propertyId?.trim() : body.siteUrl?.trim();
  if (!targetId) {
    throw new Error(provider === "ga4" ? "invalid_property_id" : "invalid_site_url");
  }

  const rowLimit = body.rowLimit ?? DEFAULT_ROW_LIMIT;
  if (!Number.isInteger(rowLimit) || rowLimit <= 0 || rowLimit > MAX_ROW_LIMIT) {
    throw new Error("invalid_row_limit");
  }

  const defaultEndDate = new Date();
  defaultEndDate.setUTCDate(defaultEndDate.getUTCDate() - (provider === "ga4" ? 1 : 3));
  const endDate = body.endDate ?? formatDateAsIsoDay(defaultEndDate);
  if (!isValidIsoDate(endDate)) {
    throw new Error("invalid_end_date");
  }

  const defaultStartDate = new Date(`${endDate}T00:00:00Z`);
  defaultStartDate.setUTCDate(defaultStartDate.getUTCDate() - 29);
  const startDate = body.startDate ?? formatDateAsIsoDay(defaultStartDate);
  if (!isValidIsoDate(startDate)) {
    throw new Error("invalid_start_date");
  }

  if (Date.parse(`${startDate}T00:00:00Z`) > Date.parse(`${endDate}T00:00:00Z`)) {
    throw new Error("invalid_date_range");
  }

  return { provider, targetId, startDate, endDate, rowLimit };
}

function parseAnalyticsRequest(body: ChatRequestBody): ParsedAnalyticsRequest {
  const base = parseBaseRequest(body);
  if (base.provider !== "gsc") {
    throw new Error("analytics_endpoint_supports_gsc_only");
  }

  const dimension = body.dimension;
  if (!dimension || !ALLOWED_DIMENSIONS.includes(dimension)) {
    throw new Error("invalid_dimension");
  }
  return { ...base, dimension };
}

function parseChatRequest(body: ChatRequestBody): ParsedChatRequest {
  const base = parseBaseRequest(body);
  if (!body.message || !body.message.trim()) {
    throw new Error("invalid_message");
  }
  return { ...base, message: body.message.trim() };
}

async function fetchDatasetsByProvider(params: {
  accessToken: string;
  request: ParsedChatRequest;
}): Promise<AnalyticsDataset[]> {
  const { accessToken, request } = params;

  if (request.provider === "ga4") {
    return fetchGa4Datasets({
      accessToken,
      propertyId: request.targetId,
      startDate: request.startDate,
      endDate: request.endDate,
      rowLimit: request.rowLimit,
    });
  }

  return fetchGscDatasets({
    accessToken,
    siteUrl: request.targetId,
    startDate: request.startDate,
    endDate: request.endDate,
    rowLimit: request.rowLimit,
  });
}

async function buildChatAnswer(params: {
  accessToken: string;
  request: ParsedChatRequest;
}): Promise<{
  answer: string;
  datasets: AnalyticsDataset[];
}> {
  const { accessToken, request } = params;
  const datasets = await fetchDatasetsByProvider({ accessToken, request });

  const anthropicApiKey = getRequiredEnv("ANTHROPIC_API_KEY");
  const anthropicModel = process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest";

  const promptPayload = {
    provider: request.provider,
    providerLabel: getProviderLabel(request.provider),
    targetId: request.targetId,
    startDate: request.startDate,
    endDate: request.endDate,
    userQuestion: request.message,
    datasets,
  };

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: anthropicModel,
      max_tokens: 1200,
      system: getProviderSystemPrompt(request.provider),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `次のJSONデータを分析して質問に回答してください。\\n${JSON.stringify(promptPayload)}`,
            },
          ],
        },
      ],
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API failed: ${response.status} ${errorText}`);
  }

  const result = (await response.json()) as ClaudeMessageResponse;
  const answer = result.content?.find((block) => block.type === "text")?.text?.trim();
  if (!answer) {
    throw new Error("invalid_claude_response");
  }

  return { answer, datasets };
}

function isUnauthorizedGoogleError(error: unknown): boolean {
  return (error as GoogleApiError).status === 401;
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as ChatRequestBody | null;
    if (!body) {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const supabaseUrl = getRequiredEnv("SUPABASE_URL");
    const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const token = await getGoogleTokenFromSupabase(userId, supabaseUrl, serviceRoleKey);

    if (!token) {
      return NextResponse.json({ error: "google_not_connected" }, { status: 404 });
    }

    if (body.message && body.message.trim()) {
      const parsedChatRequest = parseChatRequest(body);
      const chatResult = await withRefreshedGoogleAccessToken({
        userId,
        token,
        supabaseUrl,
        serviceRoleKey,
        runWithToken: (accessToken) => buildChatAnswer({ accessToken, request: parsedChatRequest }),
        shouldRefreshRetry: isUnauthorizedGoogleError,
      });

      return NextResponse.json(
        {
          answer: chatResult.answer,
          provider: parsedChatRequest.provider,
          targetId: parsedChatRequest.targetId,
          startDate: parsedChatRequest.startDate,
          endDate: parsedChatRequest.endDate,
          datasets: chatResult.datasets,
          fetchedAt: new Date().toISOString(),
        },
        { status: 200 },
      );
    }

    const parsedAnalyticsRequest = parseAnalyticsRequest(body);
    const analyticsRows = await withRefreshedGoogleAccessToken({
      userId,
      token,
      supabaseUrl,
      serviceRoleKey,
      runWithToken: async (accessToken) => {
        return fetchGscSingleDimension({
          accessToken,
          siteUrl: parsedAnalyticsRequest.targetId,
          dimension: parsedAnalyticsRequest.dimension,
          startDate: parsedAnalyticsRequest.startDate,
          endDate: parsedAnalyticsRequest.endDate,
          rowLimit: parsedAnalyticsRequest.rowLimit,
        });
      },
      shouldRefreshRetry: isUnauthorizedGoogleError,
    });

    return NextResponse.json(
      {
        provider: parsedAnalyticsRequest.provider,
        siteUrl: parsedAnalyticsRequest.targetId,
        dimension: parsedAnalyticsRequest.dimension,
        startDate: parsedAnalyticsRequest.startDate,
        endDate: parsedAnalyticsRequest.endDate,
        rowLimit: parsedAnalyticsRequest.rowLimit,
        rows: analyticsRows,
        total: analyticsRows.length,
        fetchedAt: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("POST /api/chat failed:", error);

    if (error instanceof Error) {
      if (error.message.startsWith("Missing required")) {
        return NextResponse.json({ error: "missing_env" }, { status: 500 });
      }
      if (error.message === "refresh_token_missing") {
        return NextResponse.json(
          { error: "refresh_token_missing", action: "reconnect_google" },
          { status: 401 },
        );
      }
      if (
        error.message.includes("Google search analytics fetch failed: 403") ||
        error.message.includes("GA4 runReport failed: 403")
      ) {
        return NextResponse.json({ error: "forbidden_scope_or_resource" }, { status: 403 });
      }
      if (
        error.message.includes("Google search analytics fetch failed: 400") ||
        error.message.includes("GA4 runReport failed: 400")
      ) {
        return NextResponse.json({ error: "invalid_google_analytics_request" }, { status: 400 });
      }
      if (error.message.startsWith("Claude API failed: 401")) {
        return NextResponse.json({ error: "invalid_anthropic_api_key" }, { status: 500 });
      }
      if (error.message.startsWith("Claude API failed: 429")) {
        return NextResponse.json({ error: "anthropic_rate_limited" }, { status: 429 });
      }
      if (error.message.startsWith("invalid_") || error.message.endsWith("_only")) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
