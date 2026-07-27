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
import { Loader2, TrendingUp, BarChart3, PieChart as PieIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";

interface DailyUsageItem {
  date: string;
  total_minutes: number;
  total_calls: number;
}

interface TopTenantUsageItem {
  organization_id: number;
  email: string;
  used_minutes: number;
  remaining_minutes: number;
}

interface StatusDistributionItem {
  label: string;
  count: number;
}

interface ChartData {
  daily_usage: DailyUsageItem[];
  top_tenants: TopTenantUsageItem[];
  subscription_distribution: StatusDistributionItem[];
}

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

export function SuperadminCharts() {
  const { getAccessToken } = useAuth();
  const [data, setData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchChartsData = async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch("/api/v1/superuser/overview-charts", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const result = await res.json();
          setData(result);
        }
      } catch (err) {
        console.error("Error loading overview charts:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchChartsData();
  }, [getAccessToken]);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-border bg-muted/20">
        <Loader2 className="h-6 w-6 animate-spin text-cta mr-2" />
        <span className="text-sm text-muted-foreground">Loading system analytics diagrams...</span>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {/* Chart 1: Daily Call Volume & Duration Trend */}
      <Card className="lg:col-span-2 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-cta" />
              Daily Usage & Call Volume Trend
            </CardTitle>
            <CardDescription className="text-xs">
              System-wide call minutes and run volume over the last 14 days
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[240px] w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.daily_usage} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorMinutes" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
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
                          <p className="text-blue-500 font-medium">Minutes: {item.total_minutes} min</p>
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
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorMinutes)"
                  name="Duration (min)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Chart 2: Subscription & Account Status Distribution */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <PieIcon className="h-4 w-4 text-emerald-500" />
            Account Status Distribution
          </CardTitle>
          <CardDescription className="text-xs">
            Breakdown of tenants by subscription status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[240px] w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.subscription_distribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={85}
                  paddingAngle={4}
                  dataKey="count"
                  nameKey="label"
                >
                  {data.subscription_distribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const item = payload[0].payload as StatusDistributionItem;
                      return (
                        <div className="rounded-lg border bg-popover p-2 shadow-md text-xs">
                          <p className="font-semibold">{item.label}</p>
                          <p className="text-muted-foreground">{item.count} tenant(s)</p>
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

      {/* Chart 3: Top Tenants by Usage (Bar Chart) */}
      <Card className="lg:col-span-3 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-purple-500" />
              Top Tenants Usage Breakdown (Used vs Remaining)
            </CardTitle>
            <CardDescription className="text-xs">
              Call minutes consumed versus allocated quota for top active organizations
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[220px] w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.top_tenants} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                <XAxis dataKey="email" tick={{ fontSize: 11 }} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const item = payload[0].payload as TopTenantUsageItem;
                      return (
                        <div className="rounded-lg border bg-popover p-2.5 shadow-md text-xs space-y-1">
                          <p className="font-semibold">{item.email}</p>
                          <p className="text-purple-500 font-medium">Used: {item.used_minutes} min</p>
                          <p className="text-emerald-500 font-medium">Remaining: {item.remaining_minutes} min</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="used_minutes" name="Used Minutes" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="remaining_minutes" name="Remaining Minutes" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: "11px" }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
