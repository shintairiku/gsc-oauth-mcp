import type { GoogleTokenRow } from "@/lib/analytics/types";
import { getRequiredEnv } from "@/lib/server/env";
import { getGoogleAuthMode } from "@/lib/server/google/auth-mode";
import {
  getGoogleTokenFromSupabase,
  withRefreshedGoogleAccessToken,
} from "@/lib/server/google/token";
import { getServiceAccountAccessToken } from "@/lib/server/google/service-account";

export type GoogleAccessContext = {
  mode: "oauth" | "service_account";
  userId: string;
  token: GoogleTokenRow | null;
  supabaseUrl: string | null;
  serviceRoleKey: string | null;
};

export async function getGoogleAccessContext(userId: string): Promise<GoogleAccessContext> {
  const mode = await getGoogleAuthMode();

  if (mode === "service_account") {
    return {
      mode,
      userId,
      token: null,
      supabaseUrl: null,
      serviceRoleKey: null,
    };
  }

  const supabaseUrl = getRequiredEnv("SUPABASE_URL");
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const token = await getGoogleTokenFromSupabase(userId, supabaseUrl, serviceRoleKey);

  return {
    mode,
    userId,
    token,
    supabaseUrl,
    serviceRoleKey,
  };
}

export async function withGoogleAccessToken<T>(params: {
  context: GoogleAccessContext;
  runWithToken: (accessToken: string) => Promise<T>;
  shouldRefreshRetry?: (error: unknown) => boolean;
}): Promise<T> {
  const { context, runWithToken, shouldRefreshRetry = () => true } = params;

  if (context.mode === "service_account") {
    const accessToken = await getServiceAccountAccessToken();
    return runWithToken(accessToken);
  }

  if (!context.token || !context.supabaseUrl || !context.serviceRoleKey) {
    throw new Error("google_not_connected");
  }

  return withRefreshedGoogleAccessToken({
    userId: context.userId,
    token: context.token,
    supabaseUrl: context.supabaseUrl,
    serviceRoleKey: context.serviceRoleKey,
    runWithToken,
    shouldRefreshRetry,
  });
}
