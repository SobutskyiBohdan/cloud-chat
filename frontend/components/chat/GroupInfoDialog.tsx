"use client";

import { useState, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { api } from "@/lib/api";
import { X, Camera, Loader2, Crown, Users, UserMinus, UserPlus, Pencil, Check } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Member {
  id: string;
  role: string;
  user: { id: string; name: string; nickname: string | null; avatarUrl: string | null };
}

interface Chat {
  id: string;
  name: string | null;
  isGroup: boolean;
  avatarUrl: string | null;
  members: Member[];
}

interface SearchUser {
  id: string;
  name: string;
  nickname: string | null;
  avatarUrl: string | null;
}

interface Props {
  chat: Chat;
  currentUserId: string;
  onClose: () => void;
  onUpdated: (chat: Chat) => void;
}

export function GroupInfoDialog({ chat, currentUserId, onClose, onUpdated }: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const isOwner = chat.members.find((m) => m.user.id === currentUserId)?.role === "OWNER";

  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(chat.name || "");
  const [savingName, setSavingName] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null);

  const memberIds = new Set(chat.members.map((m) => m.user.id));

  async function saveName() {
    if (!name.trim() || name.trim() === chat.name) { setEditingName(false); return; }
    setSavingName(true);
    try {
      const { chat: updated } = await api.patch<{ chat: Chat }>(`/api/chats/${chat.id}`, { name: name.trim() });
      onUpdated(updated);
      toast({ title: "Group name updated" });
      setEditingName(false);
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSavingName(false);
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const { url } = await api.post<{ url: string }>("/api/users/avatar", { data });
      const { chat: updated } = await api.patch<{ chat: Chat }>(`/api/chats/${chat.id}`, { avatarUrl: url });
      onUpdated(updated);
      toast({ title: "Group photo updated" });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploadingAvatar(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeMember(userId: string) {
    if (!confirm("Remove this member?")) return;
    setRemovingId(userId);
    try {
      await api.delete(`/api/chats/${chat.id}/members/${userId}`);
      onUpdated({ ...chat, members: chat.members.filter((m) => m.user.id !== userId) });
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setRemovingId(null);
    }
  }

  async function leaveGroup() {
    if (!confirm("Leave this group?")) return;
    try {
      await api.delete(`/api/chats/${chat.id}/members/${currentUserId}`);
      onClose();
      window.location.href = "/chat";
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    }
  }

  async function searchUsers(q: string) {
    setMemberSearch(q);
    if (q.trim().length < 2) { setSearchResults([]); return; }
    try {
      const { users } = await api.get<{ users: SearchUser[] }>(`/api/users?q=${encodeURIComponent(q)}`);
      setSearchResults(users.filter((u) => !memberIds.has(u.id)));
    } catch {}
  }

  async function addMember(userId: string) {
    setAddingId(userId);
    try {
      const { chat: updated } = await api.post<{ chat: Chat }>(`/api/chats/${chat.id}/members`, { userId });
      onUpdated(updated);
      setSearchResults((prev) => prev.filter((u) => u.id !== userId));
      toast({ title: "Member added" });
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setAddingId(null);
    }
  }

  const groupName = chat.name || "Group";
  const initials = groupName.slice(0, 2).toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-sm flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <h2 className="text-lg font-semibold">Group Info</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-5">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={chat.avatarUrl || ""} />
                  <AvatarFallback className="text-xl">{initials}</AvatarFallback>
                </Avatar>
                {isOwner && (
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploadingAvatar}
                    className="absolute bottom-0 right-0 bg-primary text-primary-foreground rounded-full p-1.5 hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {uploadingAvatar ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
                  </button>
                )}
              </div>
              {isOwner && <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />}

              {/* Group name */}
              {editingName ? (
                <div className="flex items-center gap-2 w-full max-w-xs">
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                    autoFocus
                    className="text-center"
                  />
                  <Button size="icon" variant="ghost" onClick={saveName} disabled={savingName}>
                    {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 text-green-500" />}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setEditingName(false)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-lg">{groupName}</p>
                  {isOwner && (
                    <button onClick={() => setEditingName(true)} className="text-muted-foreground hover:text-foreground">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Users className="w-4 h-4" />
                <span>{chat.members.length} members</span>
              </div>
            </div>

            {/* Members list */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-muted-foreground">Members</p>
                {isOwner && (
                  <Button variant="ghost" size="sm" onClick={() => setShowAddMember((v) => !v)}>
                    <UserPlus className="w-3.5 h-3.5 mr-1" />Add
                  </Button>
                )}
              </div>

              {showAddMember && (
                <div className="mb-3 space-y-2">
                  <Input
                    placeholder="Search by name or @nickname..."
                    value={memberSearch}
                    onChange={(e) => searchUsers(e.target.value)}
                  />
                  {searchResults.map((u) => (
                    <div key={u.id} className="flex items-center gap-2 py-1">
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarImage src={u.avatarUrl || ""} />
                        <AvatarFallback className="text-xs">{u.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{u.name}</p>
                        {u.nickname && <p className="text-xs text-muted-foreground">@{u.nickname}</p>}
                      </div>
                      <Button size="sm" variant="outline" onClick={() => addMember(u.id)} disabled={addingId === u.id}>
                        {addingId === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Add"}
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-1">
                {chat.members.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-muted/50">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={m.user.avatarUrl || ""} />
                      <AvatarFallback className="text-xs">{m.user.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <p className="text-sm font-medium truncate">{m.user.name}</p>
                        {m.role === "OWNER" && <Crown className="w-3 h-3 text-yellow-500 shrink-0" />}
                      </div>
                      {m.user.nickname && <p className="text-xs text-muted-foreground">@{m.user.nickname}</p>}
                    </div>
                    {isOwner && m.user.id !== currentUserId && (
                      <button
                        onClick={() => removeMember(m.user.id)}
                        disabled={removingId === m.user.id}
                        className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                        title="Remove member"
                      >
                        {removingId === m.user.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserMinus className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Leave */}
            {!isOwner && (
              <Button variant="destructive" className="w-full" onClick={leaveGroup}>
                Leave Group
              </Button>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
