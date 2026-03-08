export type GoogleTokenRow = {
  clerk_user_id: string;
  access_token: string;
  refresh_token: string | null;
  scope: string;
  token_type: string;
  expires_at: string;
};

export type GoogleRefreshResponse = {
  access_token: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
};

export type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
};

export type SupabaseTokenUpdatePayload = {
  access_token: string;
  expires_at: string;
  scope?: string;
  token_type?: string;
};

export type GoogleApiError = Error & {
  status?: number;
};

export type AnalyticsProvider = "gsc" | "ga4";

export type NormalizedAnalyticsRow = {
  key: string;
  metrics: Record<string, number>;
};

export type AnalyticsDataset = {
  name: string;
  rows: NormalizedAnalyticsRow[];
};
