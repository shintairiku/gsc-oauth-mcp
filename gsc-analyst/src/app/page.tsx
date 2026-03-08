import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SignInView } from "@/components/sign-in-view";

export default async function SignInPage() {
  // 既ログインならサインイン画面を出さずdashboardへ移動する。
  const { userId } = await auth();

  if (userId) {
    redirect("/dashboard");
  }

  return <SignInView />;
}
