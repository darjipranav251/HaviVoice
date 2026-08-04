"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/lib/auth";
import type { LocalUser } from "@/lib/auth/types";

export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isLockedOut, setIsLockedOut] = useState(false);

  useEffect(() => {
    if (loading || !isAuthenticated || !user) return;

    if (pathname.startsWith("/billing") || pathname.startsWith("/auth") || pathname.startsWith("/api") || pathname === "/") {
      setIsLockedOut(false);
      return;
    }

    const localUser = user as LocalUser;

    // Superusers skip billing enforcement
    if (localUser.is_superuser) {
      setIsLockedOut(false);
      return;
    }

    const status = (localUser.stripe_subscription_status || "").toLowerCase();
    const isExplicitlyInactive = ["unpaid", "inactive", "past_due", "canceled", "cancelled", "expired"].includes(status);

    const hasValidSubscription = (status === "active" || status === "trialing" || status === "manual") && !isExplicitlyInactive;

    let trialActive = false;
    if (localUser.trial_ends_at) {
      trialActive = new Date(localUser.trial_ends_at) > new Date();
    }

    if (isExplicitlyInactive || (!trialActive && !hasValidSubscription)) {
      setIsLockedOut(true);
      router.push("/billing?lockout=true");
    } else {
      setIsLockedOut(false);
    }
  }, [user, isAuthenticated, loading, pathname, router]);

  // Render a loading state or nothing if they are locked out
  if (isLockedOut && !pathname.startsWith("/billing")) {
    return (
      <div className="flex h-full w-full items-center justify-center p-8">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p>Redirecting to billing...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
