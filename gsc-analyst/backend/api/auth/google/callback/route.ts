import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import type { GoogleTokenResponse } from "@/lib/analytics/types";
import { getRequiredEnv } from "@backend/lib/server/env";
import { upsertGoogleTokenInSupabase } from "@backend/lib/server/google/token";

const STATE_COOKIE_NAME = "google_oauth_state";

function buildDashboardRedirect(
  req: NextRequest,
  status: "connected" | "error",
  reason?: string,
) {
  const url = req.nextUrl.clone();
  url.pathname = "/dashboard";
  url.searchParams.set("google", status);
  if (reason) {
    url.searchParams.set("reason", reason);
  }
  return url;
}

function buildDashboardResponse(
  req: NextRequest,
  status: "connected" | "error",
  reason?: string,
) {
  const response = NextResponse.redirect(buildDashboardRedirect(req, status, reason));
  response.cookies.set({
    name: STATE_COOKIE_NAME,
    value: "",
    maxAge: 0,
    path: "/",
  });
  return response;
}

export async function GET(req: NextRequest) {
  const state = req.nextUrl.searchParams.get("state");
  const code = req.nextUrl.searchParams.get("code");
  const oauthError = req.nextUrl.searchParams.get("error");
  const storedState = req.cookies.get(STATE_COOKIE_NAME)?.value;
  const { userId } = await auth();

  if (oauthError) {
    return buildDashboardResponse(req, "error", oauthError);
  }

  if (!userId) {
    return buildDashboardResponse(req, "error", "unauthorized");
  }

  if (!state || !storedState || state !== storedState) {
    return buildDashboardResponse(req, "error", "state_mismatch");
  }

  if (!code) {
    return buildDashboardResponse(req, "error", "missing_code");
  }

  try {
    const clientId = getRequiredEnv("GOOGLE_OAUTH_CLIENT_ID");
    const clientSecret = getRequiredEnv("GOOGLE_OAUTH_CLIENT_SECRET");
    const redirectUri = getRequiredEnv("GOOGLE_OAUTH_REDIRECT_URI");

    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      cache: "no-store",
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Google token exchange failed:", errorText);
      return buildDashboardResponse(req, "error", "token_exchange_failed");
    }

    const tokenData = (await tokenResponse.json()) as GoogleTokenResponse;

    const supabaseUrl = getRequiredEnv("SUPABASE_URL");
    const supabaseServiceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

    await upsertGoogleTokenInSupabase({
      userId,
      token: tokenData,
      supabaseUrl,
      serviceRoleKey: supabaseServiceRoleKey,
    });

    return buildDashboardResponse(req, "connected");
  } catch (error) {
    console.error("Google OAuth callback failed:", error);
    if (error instanceof Error && error.message.startsWith("Missing required")) {
      return buildDashboardResponse(req, "error", "missing_env");
    }
    return buildDashboardResponse(req, "error", "storage_failed");
  }
}
