"use client";

import { Calendar, CreditCard, Edit, Layers, Loader2, RefreshCw, Shield, Sparkles, UserCheck, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";

export interface TenantBillingDetails {
  organization_id: number;
  email: string | null;
  name: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_subscription_status: string | null;
  current_plan: string | null;
  trial_ends_at: string | null;
  billing_cycle_start: string | null;
  billing_cycle_end: string | null;
  custom_monthly_minutes: number | null;
  custom_max_concurrency: number | null;
  created_at: string;
}

interface SuperadminBillingManagerProps {
  activeOrgId?: number | null;
  autoOpenActiveOrgModal?: boolean;
  openModalTrigger?: number;
  onModalClosed?: () => void;
}

export function SuperadminBillingManager({ activeOrgId, autoOpenActiveOrgModal, openModalTrigger, onModalClosed }: SuperadminBillingManagerProps = {}) {
  const { getAccessToken } = useAuth();
  const [tenants, setTenants] = useState<TenantBillingDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTenant, setEditingTenant] = useState<TenantBillingDetails | null>(null);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [formState, setFormState] = useState({
    current_plan: "free",
    stripe_subscription_status: "active",
    trial_ends_at: "",
    billing_cycle_start: "",
    billing_cycle_end: "",
    custom_monthly_minutes: "",
    custom_max_concurrency: "",
    stripe_customer_id: "",
    stripe_subscription_id: "",
  });

  const fetchTenantsBilling = async () => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch("/api/v1/superuser/tenants/billing", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: TenantBillingDetails[] = await res.json();
        setTenants(data);

        if ((autoOpenActiveOrgModal || (openModalTrigger && openModalTrigger > 0)) && data.length > 0) {
          const target = activeOrgId ? data.find((t) => t.organization_id === activeOrgId) || data[0] : data[0];
          if (target) {
            handleOpenEdit(target);
          }
        }
      } else {
        toast.error("Failed to load user billing records");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error connecting to server");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenantsBilling();
  }, [getAccessToken]);

  useEffect(() => {
    if ((autoOpenActiveOrgModal || (openModalTrigger && openModalTrigger > 0)) && tenants.length > 0) {
      const target = activeOrgId ? tenants.find((t) => t.organization_id === activeOrgId) || tenants[0] : tenants[0];
      if (target) {
        handleOpenEdit(target);
      }
    }
  }, [autoOpenActiveOrgModal, openModalTrigger, activeOrgId, tenants]);

  const handleOpenEdit = (tenant: TenantBillingDetails) => {
    setEditingTenant(tenant);
    
    // Helper to format ISO to datetime-local (YYYY-MM-DDTHH:mm)
    const formatForInput = (isoStr: string | null) => {
      if (!isoStr) return "";
      try {
        const d = new Date(isoStr);
        return d.toISOString().slice(0, 16);
      } catch {
        return "";
      }
    };

    setFormState({
      current_plan: tenant.current_plan || "free",
      stripe_subscription_status: tenant.stripe_subscription_status || "active",
      trial_ends_at: formatForInput(tenant.trial_ends_at),
      billing_cycle_start: formatForInput(tenant.billing_cycle_start),
      billing_cycle_end: formatForInput(tenant.billing_cycle_end),
      custom_monthly_minutes: tenant.custom_monthly_minutes !== null ? String(tenant.custom_monthly_minutes) : "",
      custom_max_concurrency: tenant.custom_max_concurrency !== null ? String(tenant.custom_max_concurrency) : "",
      stripe_customer_id: tenant.stripe_customer_id || "",
      stripe_subscription_id: tenant.stripe_subscription_id || "",
    });
  };

  const handleSaveBilling = async () => {
    if (!editingTenant) return;
    setSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) return;

      const payload = {
        current_plan: formState.current_plan,
        stripe_subscription_status: formState.stripe_subscription_status,
        stripe_customer_id: formState.stripe_customer_id,
        stripe_subscription_id: formState.stripe_subscription_id,
        trial_ends_at: formState.trial_ends_at ? new Date(formState.trial_ends_at).toISOString() : "",
        billing_cycle_start: formState.billing_cycle_start ? new Date(formState.billing_cycle_start).toISOString() : "",
        billing_cycle_end: formState.billing_cycle_end ? new Date(formState.billing_cycle_end).toISOString() : "",
        custom_monthly_minutes: formState.custom_monthly_minutes ? parseFloat(formState.custom_monthly_minutes) : null,
        custom_max_concurrency: formState.custom_max_concurrency ? parseInt(formState.custom_max_concurrency, 10) : null,
      };

      const res = await fetch(`/api/v1/superuser/tenants/${editingTenant.organization_id}/billing`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success(`Successfully updated billing & subscription for ${editingTenant.email || `Tenant #${editingTenant.organization_id}`}`);
        setEditingTenant(null);
        fetchTenantsBilling();
      } else {
        const errorData = await res.json().catch(() => ({}));
        toast.error(errorData.detail || "Failed to update tenant billing");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error saving billing details");
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status?.toLowerCase()) {
      case "active":
        return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Active</Badge>;
      case "trialing":
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Trialing</Badge>;
      case "past_due":
        return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">Past Due</Badge>;
      case "canceled":
      case "cancelled":
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Canceled</Badge>;
      case "manual":
        return <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/20">Manual Override</Badge>;
      default:
        return <Badge variant="outline">{status || "Active"}</Badge>;
    }
  };

  const getPlanBadge = (plan: string | null) => {
    switch (plan?.toLowerCase()) {
      case "enterprise":
        return <Badge className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white border-none font-semibold">Enterprise</Badge>;
      case "pro":
      case "yearly":
        return <Badge className="bg-blue-600 text-white border-none font-medium">Pro / Yearly</Badge>;
      case "starter":
      case "monthly":
        return <Badge className="bg-cyan-600 text-white border-none font-medium">Starter / Monthly</Badge>;
      default:
        return <Badge variant="secondary">Free Tier</Badge>;
    }
  };

  const formatDateDisplay = (isoStr: string | null) => {
    if (!isoStr) return "N/A";
    try {
      return new Date(isoStr).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "N/A";
    }
  };

  return (
    <Card className="col-span-full border-border/60 bg-card/60 backdrop-blur-sm shadow-md">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-xl font-bold flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-purple-500" />
            User Billing & Subscription Management
          </CardTitle>
          <CardDescription>
            Superadmin panel to modify user billing dates, subscription status, plan tiers, and custom usage limits
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={fetchTenantsBilling} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
          </div>
        ) : tenants.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No tenant billing records found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="border-b border-border/60 bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <th className="px-4 py-3">Tenant / User</th>
                  <th className="px-4 py-3">Subscription Plan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Billing Cycle Dates</th>
                  <th className="px-4 py-3">Trial Expiry</th>
                  <th className="px-4 py-3">Minutes / Concurrency</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {tenants.map((t) => (
                  <tr key={t.organization_id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">
                      <div className="flex flex-col">
                        <span className="text-foreground font-semibold">{t.email || `Tenant #${t.organization_id}`}</span>
                        <span className="text-xs text-muted-foreground">Org ID: {t.organization_id}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">{getPlanBadge(t.current_plan)}</td>
                    <td className="px-4 py-3">{getStatusBadge(t.stripe_subscription_status)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col text-xs">
                        <span>Start: {formatDateDisplay(t.billing_cycle_start)}</span>
                        <span className="text-muted-foreground">End: {formatDateDisplay(t.billing_cycle_end)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">{formatDateDisplay(t.trial_ends_at)}</td>
                    <td className="px-4 py-3 text-xs">
                      <div className="flex flex-col">
                        <span>Minutes: {t.custom_monthly_minutes !== null ? `${t.custom_monthly_minutes} min` : "Default"}</span>
                        <span className="text-muted-foreground">Max Calls: {t.custom_max_concurrency !== null ? `${t.custom_max_concurrency} max` : "Default"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleOpenEdit(t)}
                        className="gap-1.5 hover:bg-purple-500/10 hover:text-purple-500 transition-colors"
                      >
                        <Edit className="h-3.5 w-3.5" />
                        Manage Billing
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {/* Edit Tenant Billing Dialog */}
      <Dialog open={!!editingTenant} onOpenChange={(open) => { if (!open) { setEditingTenant(null); onModalClosed?.(); } }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <Sparkles className="h-5 w-5 text-purple-500" />
              Manage Billing: {editingTenant?.email || `Tenant #${editingTenant?.organization_id}`}
            </DialogTitle>
            <DialogDescription>
              Superadmin controls to modify subscription plan, billing cycle dates, trial expiration, and minute quotas.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Subscription Plan</Label>
                <Select
                  value={formState.current_plan}
                  onValueChange={(val) => setFormState({ ...formState, current_plan: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Plan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free Tier</SelectItem>
                    <SelectItem value="starter">Starter Plan ($49/mo)</SelectItem>
                    <SelectItem value="pro">Pro Plan ($149/mo)</SelectItem>
                    <SelectItem value="monthly">Monthly Standard ($49/mo)</SelectItem>
                    <SelectItem value="yearly">Yearly Saver ($468/yr)</SelectItem>
                    <SelectItem value="enterprise">Enterprise Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold">Subscription Status</Label>
                <Select
                  value={formState.stripe_subscription_status}
                  onValueChange={(val) => setFormState({ ...formState, stripe_subscription_status: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="trialing">Trialing</SelectItem>
                    <SelectItem value="past_due">Past Due</SelectItem>
                    <SelectItem value="canceled">Canceled</SelectItem>
                    <SelectItem value="unpaid">Unpaid</SelectItem>
                    <SelectItem value="manual">Manual Override</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border-t border-border/40 pt-3">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-purple-500" />
                Billing Dates & Cycle
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Billing Cycle Start Date</Label>
                  <Input
                    type="datetime-local"
                    value={formState.billing_cycle_start}
                    onChange={(e) => setFormState({ ...formState, billing_cycle_start: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Billing Cycle End Date</Label>
                  <Input
                    type="datetime-local"
                    value={formState.billing_cycle_end}
                    onChange={(e) => setFormState({ ...formState, billing_cycle_end: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5 mt-3">
                <Label className="text-xs">Trial Expiration Date</Label>
                <Input
                  type="datetime-local"
                  value={formState.trial_ends_at}
                  onChange={(e) => setFormState({ ...formState, trial_ends_at: e.target.value })}
                />
              </div>
            </div>

            <div className="border-t border-border/40 pt-3">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-purple-500" />
                Quota & Concurrency Limits
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Monthly Minutes Quota (Override)</Label>
                  <Input
                    type="number"
                    placeholder="e.g. 5000"
                    value={formState.custom_monthly_minutes}
                    onChange={(e) => setFormState({ ...formState, custom_monthly_minutes: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Max Concurrent Calls (Override)</Label>
                  <Input
                    type="number"
                    placeholder="e.g. 20"
                    value={formState.custom_max_concurrency}
                    onChange={(e) => setFormState({ ...formState, custom_max_concurrency: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-border/40 pt-3">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-purple-500" />
                Stripe Reference IDs
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Stripe Customer ID</Label>
                  <Input
                    placeholder="cus_..."
                    value={formState.stripe_customer_id}
                    onChange={(e) => setFormState({ ...formState, stripe_customer_id: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Stripe Subscription ID</Label>
                  <Input
                    placeholder="sub_..."
                    value={formState.stripe_subscription_id}
                    onChange={(e) => setFormState({ ...formState, stripe_subscription_id: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditingTenant(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSaveBilling} disabled={saving} className="bg-purple-600 hover:bg-purple-700 text-white">
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving Changes...
                </>
              ) : (
                "Save Billing Settings"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
