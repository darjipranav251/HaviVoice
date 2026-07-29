"use client";

import {
  ArrowRight,
  BarChart3,
  Calendar,
  Clock,
  Flame,
  Loader2,
  Megaphone,
  PieChart as PieIcon,
  TrendingUp,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription,CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";

interface DailyUsageItem {
  date: string;
  total_minutes: number;
  total_calls: number;
}

interface TopAgentItem {
  agent_id: number;
  agent_name: string;
  total_runs: number;
  total_minutes: number;
}

interface CampaignDistItem {
  label: string;
  count: number;
}

export interface TenantOverviewData {
  summary: {
    total_minutes: number;
    remaining_minutes: number;
    total_quota_minutes: number;
    total_agents: number;
    total_campaigns: number;
    total_runs: number;
  };
  daily_usage: DailyUsageItem[];
  top_agents: TopAgentItem[];
  campaign_distribution: CampaignDistItem[];
}

interface AppointmentSummaryData {
  total_appointments: number;
  upcoming_count: number;
  completed_count: number;
  no_show_count: number;
  no_show_rate: number;
  emergency_count: number;
  period_7days_count: number;
  period_15days_count: number;
  period_monthly_count: number;
  upcoming_appointments: Array<{
    id: number;
    client_name: string;
    client_phone?: string;
    title: string;
    start_time: string;
    status: string;
    is_emergency: boolean;
  }>;
}

const PIE_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#6b7280"];

interface TenantChartsProps {
  onDataLoaded?: (data: TenantOverviewData) => void;
}

export function TenantCharts({ onDataLoaded }: TenantChartsProps) {
  const { getAccessToken } = useAuth();
  const [data, setData] = useState<TenantOverviewData | null>(null);
  const [aptSummary, setAptSummary] = useState<AppointmentSummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTenantData = async () => {
      try {
        const token = await getAccessToken();
        const headers = { Authorization: `Bearer ${token}` };

        const [res, aptRes] = await Promise.all([
          fetch("/api/v1/organizations/tenant-overview-stats", { headers }),
          fetch("/api/v1/appointments/summary", { headers }),
        ]);

        if (res.ok) {
          const result: TenantOverviewData = await res.json();
          setData(result);
          if (onDataLoaded) onDataLoaded(result);
        }

        if (aptRes.ok) {
          const aptData: AppointmentSummaryData = await aptRes.json();
          setAptSummary(aptData);
        }
      } catch (err) {
        console.error("Error loading tenant overview stats:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchTenantData();
  }, [getAccessToken, onDataLoaded]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-border bg-muted/20">
        <Loader2 className="h-6 w-6 animate-spin text-cta mr-2" />
        <span className="text-sm text-muted-foreground">Loading workspace analytics...</span>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Metric Summary Cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Call Usage */}
        <Card className="shadow-sm border-emerald-500/20 bg-emerald-500/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
              Call Usage
            </CardTitle>
            <Clock className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {data.summary.total_minutes} min
            </div>
            <p className="text-xs text-muted-foreground mt-1 font-medium">
              <span className="text-emerald-500 font-semibold">{data.summary.remaining_minutes} min</span> remaining quota
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Appointments & Bookings */}
        <Card className="shadow-sm border-purple-500/20 bg-purple-500/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-purple-600 dark:text-purple-400">
              Appointments
            </CardTitle>
            <Calendar className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline justify-between">
              <div className="text-2xl font-bold">{aptSummary?.upcoming_count ?? 0} upcoming</div>
              {aptSummary && aptSummary.emergency_count > 0 && (
                <Badge variant="destructive" className="gap-1 text-[10px] animate-pulse">
                  <Flame className="h-3 w-3" /> {aptSummary.emergency_count} urgent
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center justify-between">
              <span>{aptSummary?.total_appointments ?? 0} total booked</span>
              <span className="text-amber-500 font-semibold">{aptSummary?.no_show_rate ?? 0}% no-show</span>
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Voice Agents */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Voice Agents</CardTitle>
            <Workflow className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.summary.total_agents}</div>
            <p className="text-xs text-muted-foreground mt-1">Active workflows configured</p>
          </CardContent>
        </Card>

        {/* Card 4: Campaigns */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Campaigns</CardTitle>
            <Megaphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.summary.total_campaigns}</div>
            <p className="text-xs text-muted-foreground mt-1">Outbound call campaigns</p>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Schedule Widget & Analytics Grid */}
      {aptSummary && (
        <Card className="shadow-sm border">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Calendar className="h-4 w-4 text-cta" />
                Upcoming Schedule & Bookings
              </CardTitle>
              <CardDescription className="text-xs">
                Next scheduled client appointments and high-priority bookings
              </CardDescription>
            </div>
            <Button asChild size="sm" variant="ghost" className="text-xs gap-1 text-cta">
              <Link href="/appointments">
                View Calendar <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {aptSummary.upcoming_appointments.length === 0 ? (
              <div className="flex h-20 items-center justify-center text-xs text-muted-foreground">
                No upcoming appointments scheduled yet.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {aptSummary.upcoming_appointments.map((apt) => (
                  <div
                    key={apt.id}
                    className="flex flex-col justify-between rounded-lg border p-3 bg-card hover:bg-muted/10 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm flex items-center gap-1.5 truncate">
                        {apt.is_emergency && <Flame className="h-3.5 w-3.5 text-red-500 animate-pulse shrink-0" />}
                        {apt.client_name}
                      </span>
                      <Badge
                        variant={apt.is_emergency ? "destructive" : "outline"}
                        className="text-[10px] capitalize shrink-0"
                      >
                        {apt.is_emergency ? "Urgent" : apt.status}
                      </Badge>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(apt.start_time).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className="truncate max-w-[110px] text-foreground font-medium">{apt.title}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Visual Analytics Diagrams */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Chart 1: Daily Call Volume & Duration Trend */}
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-cta" />
                Call Volume & Usage Trend
              </CardTitle>
              <CardDescription className="text-xs">
                Your daily call duration (minutes) and total call sessions over the last 14 days
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[240px] w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.daily_usage} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorTenantMinutes" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const item = payload[0].payload as DailyUsageItem;
                        return (
                          <div className="rounded-lg border bg-popover p-2.5 shadow-md text-xs space-y-1">
                            <p className="font-semibold text-foreground">Date: {item.date}</p>
                            <p className="text-emerald-500 font-medium">Minutes: {item.total_minutes} min</p>
                            <p className="text-muted-foreground">Calls: {item.total_calls} runs</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="total_minutes"
                    stroke="#10b981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorTenantMinutes)"
                    name="Duration (min)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Chart 2: Campaign Status Distribution */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <PieIcon className="h-4 w-4 text-blue-500" />
              Campaign Progress
            </CardTitle>
            <CardDescription className="text-xs">
              Status breakdown of outbound campaigns
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[240px] w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.campaign_distribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={85}
                    paddingAngle={4}
                    dataKey="count"
                    nameKey="label"
                  >
                    {data.campaign_distribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const item = payload[0].payload as CampaignDistItem;
                        return (
                          <div className="rounded-lg border bg-popover p-2 shadow-md text-xs">
                            <p className="font-semibold">{item.label}</p>
                            <p className="text-muted-foreground">{item.count} campaign(s)</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: "11px" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Chart 3: Top Voice Agents Performance */}
        <Card className="lg:col-span-3 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-purple-500" />
                Top Voice Agents Performance
              </CardTitle>
              <CardDescription className="text-xs">
                Call runs executed across your top configured Voice AI workflows
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[220px] w-full pt-2">
              {data.top_agents.length === 0 ? (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  No voice agent call sessions recorded yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.top_agents} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                    <XAxis dataKey="agent_name" tick={{ fontSize: 11 }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const item = payload[0].payload as TopAgentItem;
                          return (
                            <div className="rounded-lg border bg-popover p-2.5 shadow-md text-xs space-y-1">
                              <p className="font-semibold">{item.agent_name}</p>
                              <p className="text-purple-500 font-medium">Total Runs: {item.total_runs}</p>
                              <p className="text-emerald-500 font-medium">Duration: {item.total_minutes} min</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="total_runs" name="Total Call Runs" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
