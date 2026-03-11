import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import { AuthModeToggle } from "@/components/auth-mode-toggle";
import { GscChatPanel } from "@/components/gsc-chat-panel";
import { getGoogleAuthMode } from "@/lib/server/google/auth-mode";

type DashboardSearchParams = Promise<{
  google?: string;
  gsc?: string;
  reason?: string;
  mode?: string;
}>;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: DashboardSearchParams;
}) {
  const user = await currentUser();
  const params = await searchParams;
  const authMode = await getGoogleAuthMode();

  const connectionStatus = params.google ?? params.gsc;
  const isConnected = connectionStatus === "connected" || authMode === "service_account";
  const isError = connectionStatus === "error";

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b bg-white px-6 py-4">
        <h1 className="text-lg font-semibold">Analytics アナリスト</h1>
        <UserButton />
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <div className="mb-6 rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">ログイン中</p>
          <p className="mt-1 text-lg font-medium text-gray-900">{user?.emailAddresses[0]?.emailAddress}</p>
          <p className="mt-2 text-sm text-gray-600">
            Google連携1回で Search Console と GA4 を利用できます。分析サービスの選択はAIエージェントが自動で行います。
          </p>

          <div className="mt-4">
            <p className="mb-2 text-sm font-medium text-gray-700">認証方式</p>
            <AuthModeToggle initialMode={authMode} />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {authMode === "oauth" ? (
              <Link
                href="/api/auth/google"
                className="inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Googleアカウントを連携
              </Link>
            ) : (
              <p className="text-sm text-green-700">
                サービスアカウント認証モードです。ユーザーごとの Google OAuth 連携は不要です。
              </p>
            )}
            {authMode === "oauth" && isConnected && (
              <p className="text-sm text-green-700">Google OAuth連携に成功しました。</p>
            )}
            {isError && (
              <p className="text-sm text-red-700">
                Google OAuth連携に失敗しました: {params.reason ?? "unknown_error"}
              </p>
            )}
          </div>
        </div>

        <GscChatPanel />
      </main>
    </div>
  );
}
