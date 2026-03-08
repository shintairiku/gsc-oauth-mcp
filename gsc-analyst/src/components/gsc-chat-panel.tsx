"use client";

import { FormEvent, useState } from "react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ApiError = {
  error: string;
};

type ChatApiSuccess = {
  answer: string;
  toolCalls?: Array<{
    name: string;
    input: Record<string, unknown>;
    result: Record<string, unknown>;
  }>;
};

export function GscChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedMessage = inputMessage.trim();
    if (!trimmedMessage || sending) {
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
        body: JSON.stringify({ message: trimmedMessage }),
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

  const sendDisabled = sending || !inputMessage.trim();

  return (
    <section className="w-full rounded-xl border bg-white p-4 text-left shadow-sm">
      <p className="mb-3 text-sm text-gray-600">
        サービス選択は不要です。質問内容に応じてAIエージェントがGSC/GA4のMCPツールを自動で使い分けます。
      </p>

      <div className="mb-4 h-[340px] overflow-y-auto rounded-lg border bg-gray-50 p-3">
        {messages.length === 0 && (
          <p className="text-sm text-gray-500">
            例: 直近30日で自然検索の課題を教えて / CV観点で流入元の改善優先度を教えて
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
              分析中...
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
          placeholder="例: 最近コンバージョンが落ちています。原因仮説と優先施策を教えて"
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
