"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { api } from "@/lib/api";
import { Search, Trash2, ShieldOff, Shield, Loader2, ChevronLeft, ChevronRight, Users } from "lucide-react";

interface Group {
  id: string;
  name: string | null;
  isBlocked: boolean;
  createdAt: string;
  _count: { members: number; messages: number };
}

export function GroupTable() {
  const { toast } = useToast();
  const [groups, setGroups] = useState<Group[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ groups: Group[]; total: number; pages: number }>(`/api/admin/groups?page=${page}&search=${encodeURIComponent(search)}`);
      setGroups(data.groups);
      setTotal(data.total);
      setPages(data.pages);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  async function toggleBlock(group: Group) {
    setActionId(group.id);
    try {
      await api.patch(`/api/admin/groups/${group.id}`, { isBlocked: !group.isBlocked });
      toast({ title: group.isBlocked ? "Group unblocked" : "Group blocked" });
      load();
    } catch { toast({ title: "Error", variant: "destructive" }); }
    finally { setActionId(null); }
  }

  async function deleteGroup(group: Group) {
    if (!confirm(`Delete group "${group.name || group.id}"?`)) return;
    setActionId(group.id);
    try {
      await api.delete(`/api/admin/groups/${group.id}`);
      toast({ title: "Group deleted" });
      load();
    } catch { toast({ title: "Error", variant: "destructive" }); }
    finally { setActionId(null); }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search groups..." className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <span className="text-sm text-muted-foreground">{total} groups</span>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : groups.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground"><Users className="w-8 h-8 mx-auto mb-2 opacity-40" /><p>No groups found</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-medium text-muted-foreground">Name</th>
                    <th className="text-left p-3 font-medium text-muted-foreground hidden sm:table-cell">Members</th>
                    <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Messages</th>
                    <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Created</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => (
                    <tr key={group.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="p-3 font-medium">{group.name || `Group ${group.id.slice(0, 6)}`}</td>
                      <td className="p-3 hidden sm:table-cell text-muted-foreground">{group._count.members}</td>
                      <td className="p-3 hidden md:table-cell text-muted-foreground">{group._count.messages}</td>
                      <td className="p-3 hidden md:table-cell text-muted-foreground">{new Date(group.createdAt).toLocaleDateString()}</td>
                      <td className="p-3">{group.isBlocked ? <Badge variant="destructive" className="text-xs">Blocked</Badge> : <Badge variant="success" className="text-xs">Active</Badge>}</td>
                      <td className="p-3 text-right">
                        <div className="flex gap-1 justify-end">
                          <Button variant="outline" size="sm" onClick={() => toggleBlock(group)} disabled={actionId === group.id}>
                            {actionId === group.id ? <Loader2 className="w-3 h-3 animate-spin" /> : group.isBlocked ? <ShieldOff className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => deleteGroup(group)} disabled={actionId === group.id}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </td>
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
