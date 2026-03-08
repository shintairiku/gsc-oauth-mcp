import { SignIn } from "@clerk/nextjs";

export function SignInView() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <SignIn fallbackRedirectUrl="/dashboard" />
    </div>
  );
}
