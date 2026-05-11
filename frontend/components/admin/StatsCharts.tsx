"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { api } from "@/lib/api";
import { Users, MessageSquare, Wifi, Shield, TrendingUp, UserPlus, Loader2 } from "lucide-react";

interface Stats {
  totalUsers: number;
  newUsersToday: number;
  totalMessages: number;
  messagesLast24h: number;
  totalGroups: number;
  blockedUsers: number;
  activeConnections: number;
}

interface ChartData {
  hourlyMessages: { hour: string; messages: number }[];
  hourlyUsers: { hour: string; users: number }[];
}

export function StatsCharts() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [charts, setCharts] = useState<ChartData>({ hourlyMessages: [], hourlyUsers: [] });

  async function refresh() {
    try {
      const data = await api.get<{ stats: Stats; charts: ChartData }>("/api/admin/stats");
      setStats(data.stats);
      setCharts(data.charts);
    } catch {}
  }

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!stats) {
    return <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const statCards = [
    { title: "Total Users", value: stats.totalUsers, icon: Users, color: "text-blue-500" },
    { title: "New Today", value: stats.newUsersToday, icon: UserPlus, color: "text-green-500" },
    { title: "Messages (24h)", value: stats.messagesLast24h, icon: MessageSquare, color: "text-purple-500" },
    { title: "Active Connections", value: stats.activeConnections, icon: Wifi, color: "text-orange-500" },
    { title: "Total Groups", value: stats.totalGroups, icon: TrendingUp, color: "text-indigo-500" },
    { title: "Blocked Users", value: stats.blockedUsers, icon: Shield, color: "text-red-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {statCards.map(({ title, value, icon: Icon, color }) => (
          <Card key={title}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-muted ${color}`}><Icon className="w-5 h-5" /></div>
              <div>
                <p className="text-2xl font-bold">{value.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{title}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Messages (last 24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={charts.hourlyMessages}>
                <defs>
                  <linearGradient id="msgGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={3} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Area type="monotone" dataKey="messages" stroke="#3b82f6" fill="url(#msgGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">New Users (last 24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={charts.hourlyUsers}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={3} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="users" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
