export type GoogleAuthMode = "oauth" | "service_account";

export function parseGoogleAuthMode(value: string | null | undefined): GoogleAuthMode {
  return value === "service_account" ? "service_account" : "oauth";
}
