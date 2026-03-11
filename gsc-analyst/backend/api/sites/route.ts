import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { listGscSites } from "@backend/lib/server/analytics/providers/gsc";
import { getGoogleAccessContext, withGoogleAccessToken } from "@backend/lib/server/google/access";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const context = await getGoogleAccessContext(userId);
    if (context.mode === "oauth" && !context.token) {
      return NextResponse.json({ error: "google_not_connected" }, { status: 404 });
    }

    const sites = await withGoogleAccessToken({
      context,
      runWithToken: (accessToken) => listGscSites(accessToken),
      shouldRefreshRetry: () => true,
    });

    return NextResponse.json(
      {
        sites,
        total: sites.length,
        fetchedAt: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET /api/sites failed:", error);

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
    }

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
