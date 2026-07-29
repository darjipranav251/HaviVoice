"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth";

interface Tenant {
  organization_id: number;
  email: string;
  name: string;
}

export function AdminModeBanner() {
  const { user, getAccessToken } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [resetting, setResetting] = useState(false);

  const currentOrgId = (user as any)?.organizationId ? parseInt((user as any).organizationId, 10) : null;
  const isSuperuser = (user as any)?.is_superuser ?? false;

  useEffect(() => {
    if (!isSuperuser) return;

    const fetchTenants = async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch("/api/v1/superuser/tenants", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (res.ok) {
          const data = await res.json();
          setTenants(data);
        }
      } catch (err) {
        console.error("Error loading tenants in banner:", err);
      }
    };

    fetchTenants();
  }, [isSuperuser, getAccessToken]);

  const handleReset = async () => {
    setResetting(true);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/v1/superuser/reset-tenant", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error("Failed to reset context");

      const userRes = await fetch("/api/v1/user/auth/user", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (userRes.ok) {
        const authUserData = await userRes.json();
        const updatedUser = {
          ...user,
          ...authUserData,
          organizationId: authUserData.organization_id ? String(authUserData.organization_id) : (user as any)?.organizationId
        };
        await fetch("/api/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, user: updatedUser }),
        });
      }

      toast.success("Returned to Global Admin View");
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error resetting context");
      setResetting(false);
    }
  };

  if (!isSuperuser) return null;

  // Resolve current active tenant email
  const activeTenant = tenants.find(t => t.organization_id === currentOrgId);

  // If active org belongs to another user (not the logged in superadmin), show banner
  const isViewingOtherTenant = activeTenant && activeTenant.email !== (user as any)?.email;

  if (!isViewingOtherTenant) return null;

  return (
    <div className="z-[9999] w-full border-b border-amber-300 bg-amber-500 px-4 py-2.5 text-center text-sm font-semibold text-black shadow-md dark:border-amber-700 dark:bg-amber-600 dark:text-white">
      <div className="container mx-auto flex flex-col items-center justify-center gap-2 sm:flex-row sm:gap-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 animate-pulse text-black dark:text-white" />
          <span>
            Admin Mode: You are viewing and editing data for{" "}
            <span className="underline decoration-dotted font-bold">{activeTenant.email}</span> (Org {activeTenant.organization_id}).
          </span>
        </div>
        <button
          onClick={handleReset}
          disabled={resetting}
          className="inline-flex h-7 items-center justify-center rounded-full border border-black bg-black px-3.5 text-xs font-bold text-white shadow transition-colors hover:bg-neutral-900 disabled:opacity-50 dark:border-white dark:bg-white dark:text-black dark:hover:bg-neutral-100"
        >
          {resetting ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
          ) : null}
          Exit Admin Mode
        </button>
      </div>
    </div>
  );
}
