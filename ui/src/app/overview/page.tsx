"use client";

import {
  ArrowRight,
  Calendar,
  Flame,
  Loader2,
  Megaphone,
  Search,
  Shield,
  TrendingUp,
  Users,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";

import { BreakdownCategory,SuperadminBreakdownModal } from "./components/SuperadminBreakdownModal";
import { SuperadminCharts } from "./components/SuperadminCharts";
import { TenantCharts } from "./components/TenantCharts";

interface Tenant {
  organization_id: number;
  email: string;
  name: string;
  business_name?: string;
  business_type?: string;
}

interface Stats {
  total_minutes: number;
  total_agents: number;
  total_campaigns: number;
  total_tenants: number;
  total_appointments?: number;
  emergency_appointments?: number;
}

export default function OverviewPage() {
  const { user, provider, getAccessToken } = useAuth();
  const router = useRouter();
  const isOSSMode = provider !== "stack";
  const isSuperuser = (user as any)?.is_superuser ?? false;

  const [stats, setStats] = useState<Stats | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(isSuperuser);
  const [searchTerm, setSearchTerm] = useState("");
  const [switchingId, setSwitchingId] = useState<number | null>(null);

  // Modal State for Metric Card Breakdown
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<BreakdownCategory>("usage");

  // Pagination state for System Accounts table
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // Track active tenant view
  const currentOrgId = (user as any)?.organizationId ? parseInt((user as any).organizationId, 10) : null;
  // If the active org ID belongs to a non-admin tenant, we are in "Admin Mode"
  const isGlobalView = !tenants.some(
    (t) => t.organization_id === currentOrgId && t.email === (user as any)?.email
  );

  useEffect(() => {
    if (!isSuperuser) return;

    const fetchOverviewData = async () => {
      try {
        const token = await getAccessToken();
        const headers = { Authorization: `Bearer ${token}` };

        // Fetch overall stats
        const statsRes = await fetch("/api/v1/superuser/overview-stats", { headers });
        if (!statsRes.ok) throw new Error("Failed to load stats");
        const statsData = await statsRes.json();
        setStats(statsData);

        // Fetch tenant list
        const tenantsRes = await fetch("/api/v1/superuser/tenants", { headers });
        if (!tenantsRes.ok) throw new Error("Failed to load tenants");
        const tenantsData = await tenantsRes.json();
        setTenants(tenantsData);
      } catch (err) {
        console.error("Error loading overview data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchOverviewData();
  }, [isSuperuser, getAccessToken]);

  // Reset pagination to first page when search criteria updates
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const handleManageTenant = async (orgId: number, email: string) => {
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
          organizationId: authUserData.organization_id ? String(authUserData.organization_id) : (user as any)?.organizationId
        };
        await fetch("/api/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, user: updatedUser }),
        });
      }

      toast.success(`Switched context to ${email}`);
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error switching context");
      setSwitchingId(null);
    }
  };

  const filteredTenants = tenants.filter(
    (t) =>
      t.email !== (user as any)?.email && (
        t.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.business_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.business_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(t.organization_id).includes(searchTerm)
      )
  );

  const totalPages = Math.ceil(filteredTenants.length / itemsPerPage);
  const paginatedTenants = filteredTenants.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Render Superadmin Overview Dashboard if in global view
  if (isSuperuser && isGlobalView) {
    return (
      <div className="container mx-auto px-4 py-8 space-y-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">System Overview</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Global administration panel and aggregate metrics
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-cta/25 bg-cta/5 px-4 py-1 text-xs font-semibold text-cta">
            <Shield className="h-4 w-4" />
            <span>Super Administrator Mode</span>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[400px] flex-col items-center justify-center gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-cta" />
            <p className="text-sm text-muted-foreground">Loading system data...</p>
          </div>
        ) : (
          <>
            {/* Clickable Metric Cards */}
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
              <Card
                onClick={() => {
                  setSelectedCategory("usage");
                  setModalOpen(true);
                }}
                className="cursor-pointer transition-all hover:border-cta/60 hover:shadow-md group relative overflow-hidden"
              >
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-sm font-medium group-hover:text-cta transition-colors">
                    Total Usage
                  </CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground group-hover:text-cta transition-colors" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {stats?.total_minutes.toLocaleString()} min
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center justify-between">
                    <span>System-wide duration</span>
                    <span className="text-[10px] text-cta opacity-0 group-hover:opacity-100 transition-opacity font-semibold">
                      Breakdown &rarr;
                    </span>
                  </p>
                </CardContent>
              </Card>

              <Card
                onClick={() => {
                  router.push("/appointments");
                }}
                className="cursor-pointer transition-all border-purple-500/30 bg-purple-500/5 hover:border-purple-500 hover:shadow-md group relative overflow-hidden"
              >
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-sm font-medium text-purple-600 dark:text-purple-400 group-hover:text-purple-500 transition-colors">
                    Appointments
                  </CardTitle>
                  <Calendar className="h-4 w-4 text-purple-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {stats?.total_appointments ?? 0} booked
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      {stats?.emergency_appointments ? (
                        <span className="text-red-500 font-semibold flex items-center gap-0.5">
                          <Flame className="h-3 w-3 animate-pulse" /> {stats.emergency_appointments} urgent
                        </span>
                      ) : (
                        "System bookings"
                      )}
                    </span>
                    <span className="text-[10px] text-purple-500 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">
                      View Calendar &rarr;
                    </span>
                  </p>
                </CardContent>
              </Card>

              <Card
                onClick={() => {
                  setSelectedCategory("agents");
                  setModalOpen(true);
                }}
                className="cursor-pointer transition-all hover:border-cta/60 hover:shadow-md group relative overflow-hidden"
              >
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-sm font-medium group-hover:text-cta transition-colors">
                    Voice Agents
                  </CardTitle>
                  <Workflow className="h-4 w-4 text-muted-foreground group-hover:text-cta transition-colors" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats?.total_agents}</div>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center justify-between">
                    <span>Active workflows</span>
                    <span className="text-[10px] text-cta opacity-0 group-hover:opacity-100 transition-opacity font-semibold">
                      Breakdown &rarr;
                    </span>
                  </p>
                </CardContent>
              </Card>

              <Card
                onClick={() => {
                  setSelectedCategory("campaigns");
                  setModalOpen(true);
                }}
                className="cursor-pointer transition-all hover:border-cta/60 hover:shadow-md group relative overflow-hidden"
              >
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-sm font-medium group-hover:text-cta transition-colors">
                    Campaigns
                  </CardTitle>
                  <Megaphone className="h-4 w-4 text-muted-foreground group-hover:text-cta transition-colors" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats?.total_campaigns}</div>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center justify-between">
                    <span>Outbound campaigns</span>
                    <span className="text-[10px] text-cta opacity-0 group-hover:opacity-100 transition-opacity font-semibold">
                      Breakdown &rarr;
                    </span>
                  </p>
                </CardContent>
              </Card>

              <Card
                onClick={() => {
                  setSelectedCategory("tenants");
                  setModalOpen(true);
                }}
                className="cursor-pointer transition-all hover:border-cta/60 hover:shadow-md group relative overflow-hidden"
              >
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-sm font-medium group-hover:text-cta transition-colors">
                    Active Tenants
                  </CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground group-hover:text-cta transition-colors" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats?.total_tenants}</div>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center justify-between">
                    <span>Total accounts</span>
                    <span className="text-[10px] text-cta opacity-0 group-hover:opacity-100 transition-opacity font-semibold">
                      Breakdown &rarr;
                    </span>
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Visual Analytics Charts */}
            <SuperadminCharts />

            {/* Tenant Directory */}
            <Card>
              <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-6">
                <div>
                  <CardTitle className="text-xl">Tenant Directory</CardTitle>
                  <CardDescription className="mt-1">
                    Search and switch contexts to view or manage resources for specific clients
                  </CardDescription>
                </div>
                <div className="relative w-full max-w-sm">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search by email, name or ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 bg-muted/20"
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted/50 text-xs font-semibold uppercase text-muted-foreground">
                      <tr>
                        <th className="px-6 py-4">Org ID</th>
                        <th className="px-6 py-4">Client Email</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {paginatedTenants.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-6 py-8 text-center text-muted-foreground">
                            No tenants matched your search query.
                          </td>
                        </tr>
                      ) : (
                        paginatedTenants.map((tenant) => (
                          <tr
                            key={tenant.organization_id}
                            className="hover:bg-muted/10 transition-colors"
                          >
                            <td className="px-6 py-4 font-mono font-medium">
                              {tenant.organization_id}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col">
                                <span className="font-semibold text-foreground">
                                  {tenant.business_name || tenant.name || tenant.email}
                                </span>
                                <span className="text-xs text-muted-foreground font-normal">
                                  {tenant.email}{tenant.business_type ? ` • ${tenant.business_type}` : ""}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={switchingId !== null}
                                onClick={() =>
                                  handleManageTenant(tenant.organization_id, tenant.email)
                                }
                                className="h-8 gap-1.5 rounded-full"
                              >
                                {switchingId === tenant.organization_id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <ArrowRight className="h-3.5 w-3.5" />
                                )}
                                Manage
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 px-2 py-1">
                    <p className="text-xs text-muted-foreground">
                      Showing <span className="font-semibold text-foreground">{Math.min(filteredTenants.length, (currentPage - 1) * itemsPerPage + 1)}</span> to{" "}
                      <span className="font-semibold text-foreground">{Math.min(filteredTenants.length, currentPage * itemsPerPage)}</span> of{" "}
                      <span className="font-semibold text-foreground">{filteredTenants.length}</span> tenants
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        className="h-8 rounded-md"
                      >
                        Previous
                      </Button>
                      <span className="text-xs font-medium text-foreground">
                        Page {currentPage} of {totalPages}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        className="h-8 rounded-md"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Breakdown Modal */}
            <SuperadminBreakdownModal
              open={modalOpen}
              onOpenChange={setModalOpen}
              initialCategory={selectedCategory}
            />
          </>
        )}
      </div>
    );
  }

  // Render standard tenant dashboard with visual analytics diagrams
  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      {/* Workspace Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Workspace Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time call volume trends, voice agent performance, and resource usage
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link href="/recordings">View Recordings</Link>
          </Button>
          {isSuperuser && (
            <Button asChild size="sm" className="rounded-full">
              <Link href="/workflow">Manage Agents &rarr;</Link>
            </Button>
          )}
        </div>
      </div>

      {/* Visual Charts & Tenant Metrics */}
      <TenantCharts />
    </div>
  );
}
