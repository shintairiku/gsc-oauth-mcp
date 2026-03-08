import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { runAnalyticsAgent } from "@/lib/server/agent/analytics-agent";
import { getRequiredEnv } from "@/lib/server/env";
import { buildAnalyticsMcpTools } from "@/lib/server/mcp/analytics-tools";
import { getGoogleTokenFromSupabase, withRefreshedGoogleAccessToken } from "@/lib/server/google/token";

type ChatRequestBody = {
  message?: string;
};

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

    const message = body.message?.trim();
    if (!message) {
      return NextResponse.json({ error: "invalid_message" }, { status: 400 });
    }

    const supabaseUrl = getRequiredEnv("SUPABASE_URL");
    const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const token = await getGoogleTokenFromSupabase(userId, supabaseUrl, serviceRoleKey);

    if (!token) {
      return NextResponse.json({ error: "google_not_connected" }, { status: 404 });
    }

    const result = await withRefreshedGoogleAccessToken({
      userId,
      token,
      supabaseUrl,
      serviceRoleKey,
      runWithToken: async (accessToken) => {
        const tools = buildAnalyticsMcpTools(accessToken);
        return runAnalyticsAgent({
          userMessage: message,
          tools,
        });
      },
      shouldRefreshRetry: () => true,
    });

    return NextResponse.json(
      {
        answer: result.answer,
        toolCalls: result.toolCalls,
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
      if (error.message.startsWith("Claude API failed: 401")) {
        return NextResponse.json({ error: "invalid_anthropic_api_key" }, { status: 500 });
      }
      if (error.message.startsWith("Claude API failed: 429")) {
        return NextResponse.json({ error: "anthropic_rate_limited" }, { status: 429 });
      }
      if (error.message === "agent_max_steps_exceeded") {
        return NextResponse.json({ error: "agent_max_steps_exceeded" }, { status: 500 });
      }
      if (error.message.startsWith("gsc_") || error.message.startsWith("ga4_")) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
