"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/use-toast";
import { api } from "@/lib/api";
import { Search, Loader2, X, Users } from "lucide-react";

interface User {
  id: string;
  name: string;
  nickname: string | null;
  avatarUrl: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (chatId: string) => void;
}

export function NewChatDialog({ open, onOpenChange, onCreated }: Props) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [selected, setSelected] = useState<User[]>([]);
  const [groupName, setGroupName] = useState("");
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const { users } = await api.get<{ users: User[] }>(`/api/users?q=${encodeURIComponent(q)}`);
      setResults(users);
    } finally {
      setSearching(false);
    }
  }, []);

  function toggle(user: User) {
    setSelected((prev) => prev.find((u) => u.id === user.id) ? prev.filter((u) => u.id !== user.id) : [...prev, user]);
  }

  async function handleCreate() {
    if (!selected.length) return;
    setLoading(true);
    try {
      const isGroup = selected.length > 1;
      const { chat } = await api.post<{ chat: { id: string } }>("/api/chats", {
        memberIds: selected.map((u) => u.id),
        isGroup,
        name: isGroup ? groupName || "Group Chat" : undefined,
      });
      onCreated(chat.id);
      onOpenChange(false);
      setSelected([]); setQuery(""); setGroupName("");
    } catch {
      toast({ title: "Error", description: "Failed to create chat", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">New Conversation</h2>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}><X className="w-4 h-4" /></Button>
        </div>
        <div className="p-4 space-y-3">
          {selected.length > 1 && (
            <Input placeholder="Group name" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by @nickname or name..."
              className="pl-9"
              value={query}
              onChange={(e) => { setQuery(e.target.value); search(e.target.value); }}
            />
            {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
          </div>
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selected.map((u) => (
                <div key={u.id} className="flex items-center gap-1 bg-primary/10 text-primary rounded-full px-3 py-1 text-sm">
                  <span>{u.nickname ? `@${u.nickname}` : u.name}</span>
                  <button onClick={() => toggle(u)}><X className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
          )}
          <div className="max-h-60 overflow-y-auto space-y-1">
            {results.map((user) => (
              <button key={user.id} onClick={() => toggle(user)} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent transition-colors text-left ${selected.some((u) => u.id === user.id) ? "bg-primary/10" : ""}`}>
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user.avatarUrl || ""} />
                  <AvatarFallback className="text-xs">{user.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{user.name}</p>
                  {user.nickname && <p className="text-xs text-muted-foreground">@{user.nickname}</p>}
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className="p-4 border-t flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!selected.length || loading}>
            {loading && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}
            {selected.length > 1 ? <><Users className="mr-2 w-4 h-4" />Create Group</> : "Open Chat"}
          </Button>
        </div>
      </div>
    </div>
  );
}
