import { NextRequest, NextResponse } from "next/server";
import {
  type GoogleAuthMode,
  GOOGLE_AUTH_MODE_COOKIE_NAME,
  parseGoogleAuthMode,
} from "@backend/lib/server/google/auth-mode";

function resolveRedirectPath(value: string | null): string {
  if (!value || !value.startsWith("/")) {
    return "/dashboard";
  }
  return value;
}

function buildResponseWithCookie(mode: GoogleAuthMode, response: NextResponse): NextResponse {
  response.cookies.set({
    name: GOOGLE_AUTH_MODE_COOKIE_NAME,
    value: mode,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}

export async function GET(req: NextRequest) {
  const mode = parseGoogleAuthMode(req.nextUrl.searchParams.get("mode"));
  const redirectPath = resolveRedirectPath(req.nextUrl.searchParams.get("redirect"));
  const url = req.nextUrl.clone();
  url.pathname = redirectPath;
  url.search = "";

  return buildResponseWithCookie(mode, NextResponse.redirect(url));
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { mode?: string } | null;
  const mode = parseGoogleAuthMode(body?.mode);

  return buildResponseWithCookie(mode, NextResponse.json({ ok: true, mode }));
}
