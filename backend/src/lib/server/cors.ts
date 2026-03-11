import { NextResponse } from "next/server";
import { getFrontendAppUrl } from "@/lib/server/frontend-url";

function buildHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": getFrontendAppUrl(),
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

export function withCors(response: NextResponse): NextResponse {
  const headers = buildHeaders();
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

export function corsPreflight(): NextResponse {
  return withCors(new NextResponse(null, { status: 204 }));
}
