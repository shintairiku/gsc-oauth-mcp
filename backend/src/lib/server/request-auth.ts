import { auth, verifyToken } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";

function getBearerToken(req: Request | NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

function getQueryToken(req: Request | NextRequest): string | null {
  if (!("nextUrl" in req)) {
    return null;
  }

  const token = req.nextUrl.searchParams.get("token");
  return token?.trim() || null;
}

export async function requireUserId(req: Request | NextRequest): Promise<string> {
  const bearerToken = getBearerToken(req) ?? getQueryToken(req);

  if (bearerToken) {
    const payload = await verifyToken(bearerToken, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    if (typeof payload.sub === "string" && payload.sub) {
      return payload.sub;
    }
  }

  const authState = await auth();
  if (authState.userId) {
    return authState.userId;
  }

  throw new Error("unauthorized");
}
