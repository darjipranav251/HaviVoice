"use client";

import { Loader2,Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth";

interface Tenant {
  organization_id: number;
  email: string;
  name: string;
}

export function SuperadminTenantSwitcher() {
  const { user, getAccessToken } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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
        if (!res.ok) throw new Error("Failed to load tenants");
        const data = await res.json();
        setTenants(data);
      } catch (err) {
        console.error("Error loading tenants:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchTenants();
  }, [isSuperuser, getAccessToken]);

  const handleSwitch = async (orgIdStr: string) => {
    setSwitching(true);
    try {
      const token = await getAccessToken();
      if (orgIdStr === "global") {
        const res = await fetch("/api/v1/superuser/reset-tenant", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!res.ok) throw new Error("Failed to reset context");
        toast.success("Returned to Global Admin View");
      } else {
        const orgId = parseInt(orgIdStr, 10);
        const res = await fetch("/api/v1/superuser/select-tenant", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ organization_id: orgId }),
        });
        if (!res.ok) throw new Error("Failed to switch context");
        const selectedTenant = tenants.find(t => t.organization_id === orgId);
        toast.success(`Switched context to ${selectedTenant?.email || `Org ${orgId}`}`);
      }

      // Sync the new organization selection back to the Next.js auth cookie so SSR has the correct context
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

      // Reload page to re-fetch all data under new context
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error switching context");
      setSwitching(false);
    }
  };

  if (!isSuperuser) return null;

  // Determine if currently in shifted/tenant mode
  // The first tenant in the list is usually the superadmin's own default one, but let's check
  // if the current active org ID belongs to a non-admin tenant or if we should support reset
  const isGlobalView = !tenants.some(t => t.organization_id === currentOrgId && t.email === (user as any)?.email);

  const availableTenants = tenants.filter(t => t.email !== (user as any)?.email);
  const filteredTenants = availableTenants.filter(
    (t) =>
      t.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(t.organization_id).includes(searchQuery)
  );

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/80 bg-muted/40 p-2.5 text-xs shadow-sm">
      <div className="flex items-center justify-between font-medium text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5 text-cta" />
          <span className="font-semibold text-foreground">Superadmin Console</span>
        </div>
        {!loading && availableTenants.length > 0 && (
          <span className="text-[10px] text-muted-foreground/80 font-mono">
            {filteredTenants.length}/{availableTenants.length}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-1.5 py-1 text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Loading accounts...</span>
        </div>
      ) : (
        <div className="space-y-1.5">
          {availableTenants.length > 5 && (
            <input
              type="text"
              placeholder="Search 100+ tenants..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cta"
            />
          )}

          <select
            disabled={switching}
            value={isGlobalView ? "global" : currentOrgId || "global"}
            onChange={(e) => handleSwitch(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground shadow-sm outline-none focus:border-cta disabled:opacity-50"
          >
            <option value="global">🌐 Global System View</option>
            {filteredTenants.map((t) => (
              <option key={t.organization_id} value={t.organization_id}>
                👤 {t.email} (Org {t.organization_id})
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
