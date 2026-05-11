"use client";

import { useState, useEffect, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { api } from "@/lib/api";
import { Search, Shield, ShieldOff, Loader2, ChevronLeft, ChevronRight } from "lucide-react";

interface User {
  id: string;
  name: string;
  email: string;
  nickname: string | null;
  role: string;
  isBlocked: boolean;
  avatarUrl: string | null;
  createdAt: string;
}

export function UserTable() {
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [blockingId, setBlockingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ users: User[]; total: number; pages: number }>(`/api/admin/users?page=${page}&search=${encodeURIComponent(search)}`);
      setUsers(data.users);
      setTotal(data.total);
      setPages(data.pages);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  async function toggleBlock(user: User) {
    setBlockingId(user.id);
    try {
      await api.post(`/api/admin/users/${user.id}/block`, { block: !user.isBlocked });
      toast({ title: user.isBlocked ? "User unblocked" : "User blocked" });
      load();
    } catch {
      toast({ title: "Error", variant: "destructive" });
    } finally {
      setBlockingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search users..." className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <span className="text-sm text-muted-foreground">{total} users</span>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-medium text-muted-foreground">User</th>
                    <th className="text-left p-3 font-medium text-muted-foreground hidden sm:table-cell">Email</th>
                    <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Joined</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarImage src={user.avatarUrl || ""} />
                            <AvatarFallback className="text-xs">{user.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="font-medium truncate max-w-[120px]">{user.name}</p>
                            {user.nickname && <p className="text-xs text-muted-foreground">@{user.nickname}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="p-3 hidden sm:table-cell text-muted-foreground truncate max-w-[180px]">{user.email}</td>
                      <td className="p-3 hidden md:table-cell text-muted-foreground">{new Date(user.createdAt).toLocaleDateString()}</td>
                      <td className="p-3">
                        <div className="flex gap-1 flex-wrap">
                          {user.role === "ADMIN" && <Badge variant="default" className="text-xs">Admin</Badge>}
                          {user.isBlocked ? <Badge variant="destructive" className="text-xs">Blocked</Badge> : <Badge variant="success" className="text-xs">Active</Badge>}
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        {user.role !== "ADMIN" && (
                          <Button variant={user.isBlocked ? "outline" : "destructive"} size="sm" onClick={() => toggleBlock(user)} disabled={blockingId === user.id}>
                            {blockingId === user.id ? <Loader2 className="w-3 h-3 animate-spin" /> : user.isBlocked ? <><ShieldOff className="w-3 h-3 mr-1" />Unblock</> : <><Shield className="w-3 h-3 mr-1" />Block</>}
                          </Button>
                        )}
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
