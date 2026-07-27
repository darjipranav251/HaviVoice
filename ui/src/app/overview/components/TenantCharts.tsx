"use client";

import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Loader2, TrendingUp, BarChart3, PieChart as PieIcon, Workflow, Megaphone, Clock, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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

const PIE_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#6b7280"];

interface TenantChartsProps {
  onDataLoaded?: (data: TenantOverviewData) => void;
}

export function TenantCharts({ onDataLoaded }: TenantChartsProps) {
  const { getAccessToken } = useAuth();
  const [data, setData] = useState<TenantOverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTenantData = async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch("/api/v1/organizations/tenant-overview-stats", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const result: TenantOverviewData = await res.json();
          setData(result);
          if (onDataLoaded) {
            onDataLoaded(result);
          }
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

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Total Runs</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.summary.total_runs}</div>
            <p className="text-xs text-muted-foreground mt-1">Executed call sessions</p>
          </CardContent>
        </Card>
      </div>

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
