import { cookies } from "next/headers";
import type { GoogleAuthMode } from "@/lib/google-auth-mode";

export const GOOGLE_AUTH_MODE_COOKIE_NAME = "google_auth_mode";
export type { GoogleAuthMode } from "@/lib/google-auth-mode";

export function parseGoogleAuthMode(value: string | null | undefined): GoogleAuthMode {
  return value === "service_account" ? "service_account" : "oauth";
}

export async function getGoogleAuthMode(): Promise<GoogleAuthMode> {
  const cookieStore = await cookies();
  return parseGoogleAuthMode(cookieStore.get(GOOGLE_AUTH_MODE_COOKIE_NAME)?.value);
}
