import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "GSC アナリスト",
  description: "Google Search Console を自然言語で分析",
};

export default function RootLayout({
  children,
}: { 
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider afterSignOutUrl="/sign-in">
      <html lang="ja">
        <body className="font-sans">{children}</body>
      </html>
    </ClerkProvider>
  );
}
