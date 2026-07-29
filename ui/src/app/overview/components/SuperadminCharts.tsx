"use client";

import { ArrowRight, BarChart3, Calendar, Clock, Flame, Loader2, PieChart as PieIcon, TrendingUp } from "lucide-react";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

interface AppointmentSummaryData {
  total_appointments: number;
  upcoming_count: number;
  completed_count: number;
  no_show_count: number;
  no_show_rate: number;
  emergency_count: number;
  upcoming_appointments: Array<{
    id: number;
    client_name: string;
    client_phone?: string;
    title: string;
    start_time: string;
    status: string;
    is_emergency: boolean;
    organization_name?: string;
  }>;
}

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

export function SuperadminCharts() {
  const { getAccessToken } = useAuth();
  const [data, setData] = useState<ChartData | null>(null);
  const [aptSummary, setAptSummary] = useState<AppointmentSummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchChartsData = async () => {
      try {
        const token = await getAccessToken();
        const headers = { Authorization: `Bearer ${token}` };

        const [res, aptRes] = await Promise.all([
          fetch("/api/v1/superuser/overview-charts", { headers }),
          fetch("/api/v1/appointments/summary", { headers }),
        ]);

        if (res.ok) {
          const result = await res.json();
          setData(result);
        }

        if (aptRes.ok) {
          const aptData = await aptRes.json();
          setAptSummary(aptData);
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

      {/* Widget 4: Upcoming Schedule & System Bookings */}
      {aptSummary && (
        <Card className="lg:col-span-3 shadow-sm border">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Calendar className="h-4 w-4 text-purple-500" />
                Upcoming Schedule & System Bookings
              </CardTitle>
              <CardDescription className="text-xs">
                System-wide upcoming client appointments across all tenant organizations
              </CardDescription>
            </div>
            <Button asChild size="sm" variant="ghost" className="text-xs gap-1 text-purple-500">
              <Link href="/appointments">
                View Calendar Console <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {aptSummary.upcoming_appointments.length === 0 ? (
              <div className="flex h-20 items-center justify-center text-xs text-muted-foreground">
                No upcoming system appointments scheduled yet.
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
                      <span className="truncate max-w-[120px] text-foreground font-medium">
                        {apt.organization_name ? apt.organization_name : apt.title}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
