"use client";

import { ArrowRight, Loader2, Megaphone, Search, TrendingUp, Users,Workflow } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";

export type BreakdownCategory = "usage" | "agents" | "campaigns" | "tenants" | "appointments";

interface SuperadminBreakdownModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCategory?: BreakdownCategory;
}

export function SuperadminBreakdownModal({
  open,
  onOpenChange,
  initialCategory = "usage",
}: SuperadminBreakdownModalProps) {
  const { user, getAccessToken } = useAuth();
  const [activeCategory, setActiveCategory] = useState<BreakdownCategory>(initialCategory);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [switchingId, setSwitchingId] = useState<number | null>(null);
  const itemsPerPage = 7;

  useEffect(() => {
    if (initialCategory) {
      setActiveCategory(initialCategory);
    }
  }, [initialCategory]);

  useEffect(() => {
    if (!open) return;

    const fetchBreakdown = async () => {
      setLoading(true);
      try {
        const token = await getAccessToken();
        const res = await fetch(`/api/v1/superuser/overview-breakdown?category=${activeCategory}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to fetch breakdown data");
        const result = await res.json();
        setData(result);
      } catch (err) {
        toast.error("Error loading breakdown details");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchBreakdown();
  }, [open, activeCategory, getAccessToken]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeCategory]);

  const handleManage = async (orgId: number, email: string) => {
    setSwitchingId(orgId);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/v1/superuser/select-tenant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ organization_id: orgId }),
      });
      if (!res.ok) throw new Error("Failed to switch context");

      const userRes = await fetch("/api/v1/user/auth/user", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (userRes.ok) {
        const authUserData = await userRes.json();
        const updatedUser = {
          ...user,
          ...authUserData,
          organizationId: authUserData.organization_id
            ? String(authUserData.organization_id)
            : (user as any)?.organizationId,
        };
        await fetch("/api/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, user: updatedUser }),
        });
      }

      toast.success(`Switched context to ${email}`);
      window.location.href = "/workflow";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error switching context");
      setSwitchingId(null);
    }
  };

  const filteredData = data.filter(
    (item) =>
      item.email !== (user as any)?.email &&
      (item.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.business_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.business_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(item.organization_id).includes(searchTerm))
  );

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <span>System Resource Breakdown</span>
          </DialogTitle>
          <DialogDescription>
            Detailed per-tenant metrics and resource allocation overview
          </DialogDescription>
        </DialogHeader>

        {/* Category Tabs */}
        <div className="flex flex-col gap-4 mt-2">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <Tabs
              value={activeCategory}
              onValueChange={(val) => setActiveCategory(val as BreakdownCategory)}
              className="w-full sm:w-auto"
            >
              <TabsList className="grid grid-cols-4 w-full sm:w-auto">
                <TabsTrigger value="usage" className="flex items-center gap-1.5 text-xs">
                  <TrendingUp className="h-3.5 w-3.5" />
                  <span>Usage</span>
                </TabsTrigger>
                <TabsTrigger value="agents" className="flex items-center gap-1.5 text-xs">
                  <Workflow className="h-3.5 w-3.5" />
                  <span>Agents</span>
                </TabsTrigger>
                <TabsTrigger value="campaigns" className="flex items-center gap-1.5 text-xs">
                  <Megaphone className="h-3.5 w-3.5" />
                  <span>Campaigns</span>
                </TabsTrigger>
                <TabsTrigger value="tenants" className="flex items-center gap-1.5 text-xs">
                  <Users className="h-3.5 w-3.5" />
                  <span>Tenants</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search tenant..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-9 text-xs"
              />
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto rounded-lg border border-border min-h-[300px]">
            {loading ? (
              <div className="flex min-h-[300px] items-center justify-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-cta" />
                <span className="text-sm text-muted-foreground">Loading breakdown data...</span>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/60 font-semibold uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Org ID</th>
                    <th className="px-4 py-3">Tenant Email</th>
                    {activeCategory === "usage" && (
                      <>
                        <th className="px-4 py-3 text-right">Used Mins</th>
                        <th className="px-4 py-3 text-right">Remaining Mins</th>
                        <th className="px-4 py-3 text-right">Total Quota</th>
                        <th className="px-4 py-3 text-right">Total Calls</th>
                      </>
                    )}
                    {activeCategory === "agents" && (
                      <>
                        <th className="px-4 py-3 text-right">Total Agents</th>
                        <th className="px-4 py-3 text-right">Active Runs</th>
                        <th className="px-4 py-3">Latest Agent</th>
                      </>
                    )}
                    {activeCategory === "campaigns" && (
                      <>
                        <th className="px-4 py-3 text-right">Total Campaigns</th>
                        <th className="px-4 py-3 text-right">Active</th>
                        <th className="px-4 py-3 text-right">Completed</th>
                        <th className="px-4 py-3 text-right">Contacts</th>
                      </>
                    )}
                    {activeCategory === "tenants" && (
                      <>
                        <th className="px-4 py-3">Plan</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Trial Ends</th>
                      </>
                    )}
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginatedData.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                        No tenants matched your query.
                      </td>
                    </tr>
                  ) : (
                    paginatedData.map((item) => (
                      <tr key={item.organization_id} className="hover:bg-muted/10 transition-colors">
                        <td className="px-4 py-3 font-mono font-medium">{item.organization_id}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="font-semibold text-foreground">
                              {item.business_name || item.name || item.email}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-normal">
                              {item.email}{item.business_type ? ` • ${item.business_type}` : ""}
                            </span>
                          </div>
                        </td>

                        {activeCategory === "usage" && (
                          <>
                            <td className="px-4 py-3 text-right font-medium text-blue-500">
                              {item.used_minutes} m
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-emerald-500">
                              {item.remaining_minutes} m
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-muted-foreground">
                              {item.total_quota_minutes} m
                            </td>
                            <td className="px-4 py-3 text-right">{item.total_runs}</td>
                          </>
                        )}

                        {activeCategory === "agents" && (
                          <>
                            <td className="px-4 py-3 text-right font-semibold">{item.total_agents}</td>
                            <td className="px-4 py-3 text-right text-emerald-500 font-medium">
                              {item.active_runs}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground truncate max-w-[140px]">
                              {item.top_agent_name || "None"}
                            </td>
                          </>
                        )}

                        {activeCategory === "campaigns" && (
                          <>
                            <td className="px-4 py-3 text-right font-semibold">{item.total_campaigns}</td>
                            <td className="px-4 py-3 text-right text-emerald-500 font-medium">
                              {item.active_campaigns}
                            </td>
                            <td className="px-4 py-3 text-right text-muted-foreground">
                              {item.completed_campaigns}
                            </td>
                            <td className="px-4 py-3 text-right font-mono">{item.total_contacts}</td>
                          </>
                        )}

                        {activeCategory === "tenants" && (
                          <>
                            <td className="px-4 py-3">{item.current_plan}</td>
                            <td className="px-4 py-3">
                              <Badge
                                variant={
                                  item.stripe_subscription_status === "active"
                                    ? "default"
                                    : "secondary"
                                }
                                className="text-[10px] uppercase font-bold"
                              >
                                {item.stripe_subscription_status}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right text-muted-foreground">
                              {item.trial_ends_at
                                ? new Date(item.trial_ends_at).toLocaleDateString()
                                : "N/A"}
                            </td>
                          </>
                        )}

                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={switchingId !== null}
                            onClick={() => handleManage(item.organization_id, item.email)}
                            className="h-7 text-[11px] gap-1 rounded-full"
                          >
                            {switchingId === item.organization_id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <ArrowRight className="h-3 w-3" />
                            )}
                            Manage
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Modal Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-4 mt-2 px-1">
              <p className="text-xs text-muted-foreground">
                Showing {Math.min(filteredData.length, (currentPage - 1) * itemsPerPage + 1)} -{" "}
                {Math.min(filteredData.length, currentPage * itemsPerPage)} of {filteredData.length} tenants
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  className="h-7 text-xs"
                >
                  Prev
                </Button>
                <span className="text-xs font-medium">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  className="h-7 text-xs"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
