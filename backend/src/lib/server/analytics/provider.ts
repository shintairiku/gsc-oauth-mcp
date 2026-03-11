import type { AnalyticsProvider } from "@/lib/analytics/types";

export function parseAnalyticsProvider(raw: string | undefined): AnalyticsProvider {
  if (raw === "ga4") {
    return "ga4";
  }
  return "gsc";
}

export function getProviderLabel(provider: AnalyticsProvider): string {
  return provider === "ga4" ? "Google Analytics 4" : "Google Search Console";
}

export function getProviderSystemPrompt(provider: AnalyticsProvider): string {
  if (provider === "ga4") {
    return "あなたはGA4データ分析のアシスタントです。提供データの数値を根拠に日本語で具体的に回答してください。推測は避け、施策は優先度順に提案してください。";
  }

  return "あなたはGoogle Search Consoleデータ分析のアシスタントです。提供データの数値を根拠に日本語で具体的に回答してください。推測は避け、施策は優先度順に提案してください。";
}
