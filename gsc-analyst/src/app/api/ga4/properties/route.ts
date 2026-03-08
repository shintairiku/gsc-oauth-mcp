import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getRequiredEnv } from "@/lib/server/env";
import { listGa4Properties } from "@/lib/server/analytics/providers/ga4";
import { getGoogleTokenFromSupabase, withRefreshedGoogleAccessToken } from "@/lib/server/google/token";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const supabaseUrl = getRequiredEnv("SUPABASE_URL");
    const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const token = await getGoogleTokenFromSupabase(userId, supabaseUrl, serviceRoleKey);

    if (!token) {
      return NextResponse.json({ error: "google_not_connected" }, { status: 404 });
    }

    const properties = await withRefreshedGoogleAccessToken({
      userId,
      token,
      supabaseUrl,
      serviceRoleKey,
      runWithToken: (accessToken) => listGa4Properties(accessToken),
      shouldRefreshRetry: () => true,
    });

    return NextResponse.json(
      {
        properties,
        total: properties.length,
        fetchedAt: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET /api/ga4/properties failed:", error);

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
      if (error.message.includes("GA4 properties fetch failed: 403")) {
        return NextResponse.json({ error: "forbidden_scope_or_account" }, { status: 403 });
      }
    }

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
