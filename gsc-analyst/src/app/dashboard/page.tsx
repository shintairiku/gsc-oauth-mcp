import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import { GscChatPanel } from "@/components/gsc-chat-panel";

type DashboardSearchParams = Promise<{
  gsc?: string;
  reason?: string;
}>;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: DashboardSearchParams;
}) {
  const user = await currentUser();
  const params = await searchParams;
  const isConnected = params.gsc === "connected";
  const isError = params.gsc === "error";

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b bg-white px-6 py-4">
        <h1 className="text-lg font-semibold">🔍 GSC アナリスト</h1>
        <UserButton />
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <div className="mb-6 rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">ログイン中</p>
          <p className="mt-1 text-lg font-medium text-gray-900">{user?.emailAddresses[0]?.emailAddress}</p>
          <p className="mt-2 text-sm text-gray-600">
            Google Search Console を連携し、サイトを選択してチャット分析できます。
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              href="/api/auth/gsc"
              className="inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Googleアカウントを連携
            </Link>
            {isConnected && <p className="text-sm text-green-700">GSC OAuth連携に成功しました。</p>}
            {isError && (
              <p className="text-sm text-red-700">
                GSC OAuth連携に失敗しました: {params.reason ?? "unknown_error"}
              </p>
            )}
          </div>
        </div>

        <GscChatPanel />
      </main>
    </div>
  );
}
