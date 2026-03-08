"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Provider = "gsc" | "ga4";

type SiteItem = {
  siteUrl: string;
  permissionLevel: string;
};

type Ga4PropertyItem = {
  propertyId: string;
  displayName: string;
  account: string;
};

type SitesApiSuccess = {
  sites: SiteItem[];
};

type PropertiesApiSuccess = {
  properties: Ga4PropertyItem[];
};

type ApiError = {
  error: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ChatApiSuccess = {
  answer: string;
};

export function GscChatPanel() {
  const [provider, setProvider] = useState<Provider>("gsc");

  const [sites, setSites] = useState<SiteItem[]>([]);
  const [sitesLoading, setSitesLoading] = useState(true);
  const [sitesError, setSitesError] = useState<string | null>(null);
  const [selectedSiteUrl, setSelectedSiteUrl] = useState("");

  const [properties, setProperties] = useState<Ga4PropertyItem[]>([]);
  const [propertiesLoading, setPropertiesLoading] = useState(true);
  const [propertiesError, setPropertiesError] = useState<string | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState("");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const selectedSite = useMemo(
    () => sites.find((site) => site.siteUrl === selectedSiteUrl) ?? null,
    [sites, selectedSiteUrl],
  );

  const selectedProperty = useMemo(
    () => properties.find((property) => property.propertyId === selectedPropertyId) ?? null,
    [properties, selectedPropertyId],
  );

  const loadSites = useCallback(async () => {
    setSitesLoading(true);
    setSitesError(null);

    try {
      const response = await fetch("/api/sites", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as Partial<ApiError>;
        setSites([]);
        setSitesError(data.error ?? "failed_to_fetch_sites");
        return;
      }

      const data = (await response.json()) as SitesApiSuccess;
      const nextSites = data.sites ?? [];
      setSites(nextSites);

      if (nextSites.length === 0) {
        setSelectedSiteUrl("");
        return;
      }

      setSelectedSiteUrl((current) => {
        if (current && nextSites.some((site) => site.siteUrl === current)) {
          return current;
        }
        return nextSites[0]?.siteUrl ?? "";
      });
    } catch {
      setSites([]);
      setSitesError("network_error");
    } finally {
      setSitesLoading(false);
    }
  }, []);

  const loadProperties = useCallback(async () => {
    setPropertiesLoading(true);
    setPropertiesError(null);

    try {
      const response = await fetch("/api/ga4/properties", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as Partial<ApiError>;
        setProperties([]);
        setPropertiesError(data.error ?? "failed_to_fetch_properties");
        return;
      }

      const data = (await response.json()) as PropertiesApiSuccess;
      const nextProperties = data.properties ?? [];
      setProperties(nextProperties);

      if (nextProperties.length === 0) {
        setSelectedPropertyId("");
        return;
      }

      setSelectedPropertyId((current) => {
        if (current && nextProperties.some((property) => property.propertyId === current)) {
          return current;
        }
        return nextProperties[0]?.propertyId ?? "";
      });
    } catch {
      setProperties([]);
      setPropertiesError("network_error");
    } finally {
      setPropertiesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSites();
    void loadProperties();
  }, [loadSites, loadProperties]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedMessage = inputMessage.trim();
    const targetId = provider === "ga4" ? selectedPropertyId : selectedSiteUrl;

    if (!trimmedMessage || !targetId || sending) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: "user",
      content: trimmedMessage,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage("");
    setSending(true);
    setChatError(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          provider === "ga4"
            ? {
                provider,
                propertyId: selectedPropertyId,
                message: trimmedMessage,
              }
            : {
                provider,
                siteUrl: selectedSiteUrl,
                message: trimmedMessage,
              },
        ),
        cache: "no-store",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as Partial<ApiError>;
        throw new Error(data.error ?? "failed_to_fetch_chat");
      }

      const data = (await response.json()) as ChatApiSuccess;
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-assistant`,
          role: "assistant",
          content: data.answer ?? "回答を取得できませんでした。",
        },
      ]);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "network_error";
      setChatError(errorMessage);
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-assistant-error`,
          role: "assistant",
          content: `エラーが発生しました: ${errorMessage}`,
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  const targetLoading = provider === "ga4" ? propertiesLoading : sitesLoading;
  const sendDisabled =
    sending ||
    !inputMessage.trim() ||
    (provider === "ga4" ? !selectedPropertyId : !selectedSiteUrl) ||
    targetLoading;

  return (
    <section className="w-full rounded-xl border bg-white p-4 text-left shadow-sm">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="w-full md:max-w-3xl">
          <label htmlFor="provider-select" className="mb-1 block text-xs font-semibold text-gray-700">
            データソース
          </label>
          <select
            id="provider-select"
            value={provider}
            onChange={(event) => setProvider(event.target.value as Provider)}
            className="w-full rounded-md border px-3 py-2 text-sm text-gray-900 md:w-64"
          >
            <option value="gsc">Google Search Console</option>
            <option value="ga4">Google Analytics 4</option>
          </select>

          {provider === "gsc" ? (
            <div className="mt-3">
              <label htmlFor="site-select" className="mb-1 block text-xs font-semibold text-gray-700">
                分析対象サイト
              </label>
              <div className="flex gap-2">
                <select
                  id="site-select"
                  value={selectedSiteUrl}
                  onChange={(event) => setSelectedSiteUrl(event.target.value)}
                  disabled={sitesLoading || sites.length === 0}
                  className="w-full rounded-md border px-3 py-2 text-sm text-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100"
                >
                  {sites.length === 0 && <option value="">サイトなし</option>}
                  {sites.map((site) => (
                    <option key={site.siteUrl} value={site.siteUrl}>
                      {site.siteUrl}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void loadSites()}
                  disabled={sitesLoading}
                  className="shrink-0 rounded-md border px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  再取得
                </button>
              </div>
              {selectedSite && <p className="mt-1 text-xs text-gray-500">権限: {selectedSite.permissionLevel}</p>}
              {sitesError && <p className="mt-1 text-xs text-red-700">サイト取得エラー: {sitesError}</p>}
            </div>
          ) : (
            <div className="mt-3">
              <label htmlFor="property-select" className="mb-1 block text-xs font-semibold text-gray-700">
                分析対象GA4プロパティ
              </label>
              <div className="flex gap-2">
                <select
                  id="property-select"
                  value={selectedPropertyId}
                  onChange={(event) => setSelectedPropertyId(event.target.value)}
                  disabled={propertiesLoading || properties.length === 0}
                  className="w-full rounded-md border px-3 py-2 text-sm text-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100"
                >
                  {properties.length === 0 && <option value="">プロパティなし</option>}
                  {properties.map((property) => (
                    <option key={property.propertyId} value={property.propertyId}>
                      {property.displayName} ({property.propertyId})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void loadProperties()}
                  disabled={propertiesLoading}
                  className="shrink-0 rounded-md border px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  再取得
                </button>
              </div>
              {selectedProperty && (
                <p className="mt-1 text-xs text-gray-500">アカウント: {selectedProperty.account || "(未設定)"}</p>
              )}
              {propertiesError && (
                <p className="mt-1 text-xs text-red-700">GA4プロパティ取得エラー: {propertiesError}</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mb-4 h-[340px] overflow-y-auto rounded-lg border bg-gray-50 p-3">
        {messages.length === 0 && (
          <p className="text-sm text-gray-500">
            {provider === "ga4"
              ? "GA4プロパティを選んで質問を入力すると、GA4データをもとに回答します。"
              : "サイトを選んで質問を入力すると、GSCデータをもとに回答します。"}
          </p>
        )}

        <div className="space-y-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={
                message.role === "user"
                  ? "ml-auto w-fit max-w-[90%] rounded-lg bg-blue-600 px-3 py-2 text-sm text-white"
                  : "mr-auto w-fit max-w-[90%] whitespace-pre-wrap rounded-lg bg-white px-3 py-2 text-sm text-gray-900 shadow-sm"
              }
            >
              {message.content}
            </div>
          ))}
          {sending && (
            <div className="mr-auto w-fit rounded-lg bg-white px-3 py-2 text-sm text-gray-500 shadow-sm">
              解析中...
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-2">
        <label htmlFor="chat-input" className="block text-xs font-semibold text-gray-700">
          質問
        </label>
        <textarea
          id="chat-input"
          value={inputMessage}
          onChange={(event) => setInputMessage(event.target.value)}
          rows={3}
          placeholder={
            provider === "ga4"
              ? "例: 直近30日で流入元ごとの改善優先度を教えて"
              : "例: 直近30日で改善優先度が高いページを教えて"
          }
          className="w-full rounded-md border px-3 py-2 text-sm text-gray-900"
        />
        {chatError && <p className="text-xs text-red-700">チャットエラー: {chatError}</p>}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={sendDisabled}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            送信
          </button>
        </div>
      </form>
    </section>
  );
}
