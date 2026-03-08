import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/api/auth/google/callback";
  return NextResponse.redirect(url, 307);
}
