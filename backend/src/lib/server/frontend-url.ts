const DEFAULT_FRONTEND_URL = "http://localhost:3000";

export function getFrontendAppUrl(): string {
  return process.env.FRONTEND_APP_URL ?? DEFAULT_FRONTEND_URL;
}

export function buildFrontendDashboardUrl(
  status: "connected" | "error",
  params?: { reason?: string; mode?: string },
): URL {
  const url = new URL("/dashboard", getFrontendAppUrl());
  url.searchParams.set("google", status);

  if (params?.reason) {
    url.searchParams.set("reason", params.reason);
  }

  if (params?.mode) {
    url.searchParams.set("mode", params.mode);
  }

  return url;
}
