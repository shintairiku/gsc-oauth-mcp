import { SignIn } from "@clerk/nextjs";

export function SignInView() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <SignIn fallbackRedirectUrl="/dashboard" />
    </div>
  );
}
