"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { GoogleAuthMode } from "@/lib/server/google/auth-mode";

type AuthModeToggleProps = {
  initialMode: GoogleAuthMode;
};

export function AuthModeToggle({ initialMode }: AuthModeToggleProps) {
  const router = useRouter();
  const [selectedMode, setSelectedMode] = useState<GoogleAuthMode>(initialMode);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleModeChange(mode: GoogleAuthMode) {
    if (mode === selectedMode || isPending) {
      return;
    }

    setError(null);

    try {
      const response = await fetch("/api/auth/mode", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode }),
      });

      if (!response.ok) {
        throw new Error("auth_mode_update_failed");
      }

      setSelectedMode(mode);
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError("認証方式の切り替えに失敗しました。再度お試しください。");
    }
  }

  return (
    <div className="space-y-2">
      <div className="inline-flex rounded-lg border bg-muted/30 p-1">
        <Button
          type="button"
          variant={selectedMode === "oauth" ? "default" : "ghost"}
          size="sm"
          onClick={() => void handleModeChange("oauth")}
          disabled={isPending}
          className={selectedMode === "oauth" ? "bg-blue-600 text-white hover:bg-blue-700" : "text-gray-700"}
        >
          OAuth認証
        </Button>
        <Button
          type="button"
          variant={selectedMode === "service_account" ? "default" : "ghost"}
          size="sm"
          onClick={() => void handleModeChange("service_account")}
          disabled={isPending}
          className={
            selectedMode === "service_account"
              ? "bg-emerald-600 text-white hover:bg-emerald-700"
              : "text-gray-700"
          }
        >
          サービスアカウント認証
        </Button>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
