"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";

interface Log {
  id: string;
  action: string;
  details: string | null;
  createdAt: string;
  admin: { name: string; email: string };
  target: { name: string; email: string } | null;
}

const ACTION_COLORS: Record<string, "default" | "destructive" | "secondary" | "outline" | "success" | "warning"> = {
  BLOCK_USER: "destructive",
  UNBLOCK_USER: "success",
  DELETE_GROUP: "destructive",
  BLOCK_GROUP: "warning",
  UNBLOCK_GROUP: "success",
  UPDATE_SETTINGS: "secondary",
};

export function AdminLogsTable() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ logs: Log[]; total: number; pages: number }>(`/api/admin/logs?page=${page}`);
      setLogs(data.logs);
      setTotal(data.total);
      setPages(data.pages);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{total} log entries</p>
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-medium text-muted-foreground">Time</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Admin</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Action</th>
                    <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Target</th>
                    <th className="text-left p-3 font-medium text-muted-foreground hidden lg:table-cell">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="p-3 text-muted-foreground whitespace-nowrap">{new Date(log.createdAt).toLocaleString("uk-UA")}</td>
                      <td className="p-3">
                        <p className="font-medium">{log.admin.name}</p>
                        <p className="text-xs text-muted-foreground">{log.admin.email}</p>
                      </td>
                      <td className="p-3">
                        <Badge variant={ACTION_COLORS[log.action] || "outline"} className="text-xs whitespace-nowrap">
                          {log.action.replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="p-3 hidden md:table-cell">
                        {log.target && <div><p className="font-medium">{log.target.name}</p><p className="text-xs text-muted-foreground">{log.target.email}</p></div>}
                      </td>
                      <td className="p-3 hidden lg:table-cell text-muted-foreground text-xs max-w-xs truncate">{log.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page === 1}><ChevronLeft className="w-4 h-4" /></Button>
          <span className="text-sm text-muted-foreground">{page} / {pages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page === pages}><ChevronRight className="w-4 h-4" /></Button>
        </div>
      )}
    </div>
  );
}
