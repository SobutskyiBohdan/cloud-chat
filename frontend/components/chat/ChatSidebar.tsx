"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { Search, Plus, LogOut, MessageCircle, Shield, Sun, Moon } from "lucide-react";
import { useSocket } from "@/components/providers/SocketProvider";
import { useTheme } from "@/components/providers/ThemeProvider";
import { NewChatDialog } from "./NewChatDialog";
import { ProfileEditDialog } from "@/components/profile/ProfileEditDialog";

interface Chat {
  id: string;
  name: string | null;
  isGroup: boolean;
  avatarUrl: string | null;
  members: Array<{ user: { id: string; name: string; nickname: string | null; avatarUrl: string | null } }>;
  messages: Array<{ content: string; user: { name: string }; createdAt: string }>;
  unreadCount: number;
}

interface Me {
  id: string;
  name: string;
  role: string;
  avatarUrl?: string | null;
}

export function ChatSidebar({ className }: { className?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { socket } = useSocket();
  const [chats, setChats] = useState<Chat[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [search, setSearch] = useState("");
  const [showNewChat, setShowNewChat] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const { theme, toggle: toggleTheme } = useTheme();

  const loadChats = useCallback(async () => {
    try {
      const { chats } = await api.get<{ chats: Chat[] }>("/api/chats");
      setChats(chats);
      return chats;
    } catch {
      return [];
    }
  }, []);

  const checkOnline = useCallback(async (chats: Chat[], currentUserId: string) => {
    const otherIds = [...new Set(
      chats
        .filter((c) => !c.isGroup)
        .map((c) => c.members.find((m) => m.user.id !== currentUserId)?.user.id)
        .filter(Boolean) as string[]
    )];
    if (!otherIds.length) return;
    try {
      const { onlineIds: ids } = await api.get<{ onlineIds: string[] }>(`/api/users/online?ids=${otherIds.join(",")}`);
      setOnlineIds(new Set(ids));
    } catch {}
  }, []);

  useEffect(() => {
    api.get<{ user: Me }>("/api/auth/me").then(({ user }) => {
      setMe(user);
      loadChats().then((chats) => checkOnline(chats, user.id));
    }).catch(() => {});
  }, [loadChats, checkOnline]);

  useEffect(() => {
    if (!socket) return;
    socket.on("message:new", () => {
      loadChats().then((chats) => { if (me) checkOnline(chats, me.id); });
    });
    socket.on("chat:added", ({ chat }: { chat: Chat }) => {
      setChats((prev) => {
        if (prev.some((c) => c.id === chat.id)) return prev;
        return [chat, ...prev];
      });
    });
    socket.on("user:online", ({ userId }: { userId: string }) => {
      setOnlineIds((prev) => new Set([...prev, userId]));
    });
    socket.on("user:offline", ({ userId }: { userId: string }) => {
      setOnlineIds((prev) => { const s = new Set(prev); s.delete(userId); return s; });
    });
    return () => {
      socket.off("message:new");
      socket.off("chat:added");
      socket.off("user:online");
      socket.off("user:offline");
    };
  }, [socket, loadChats, me, checkOnline]);

  async function handleLogout() {
    await api.post("/api/auth/logout");
    router.push("/login");
    router.refresh();
  }

  function getChatName(chat: Chat): string {
    if (chat.isGroup) return chat.name || "Group";
    const other = chat.members.find((m) => m.user.id !== me?.id);
    return other?.user.nickname ? `@${other.user.nickname}` : other?.user.name || "Chat";
  }

  function getChatAvatar(chat: Chat): string {
    if (chat.isGroup) return chat.avatarUrl || "";
    const other = chat.members.find((m) => m.user.id !== me?.id);
    return other?.user.avatarUrl || "";
  }

  function getOtherId(chat: Chat): string | undefined {
    if (chat.isGroup) return undefined;
    return chat.members.find((m) => m.user.id !== me?.id)?.user.id;
  }

  function initials(name: string) {
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  }

  const filtered = chats.filter((c) => getChatName(c).toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <div className={cn("flex flex-col w-full md:w-80 border-r bg-card h-full", className)}>
        <div className="p-4 flex items-center justify-between border-b">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-6 h-6 text-primary" />
            <span className="font-bold text-lg">Cloud Chat</span>
          </div>
          <div className="flex gap-1">
            {me?.role === "ADMIN" && (
              <Button variant="ghost" size="icon" asChild title="Admin Panel">
                <Link href="/admin"><Shield className="w-4 h-4" /></Link>
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={toggleTheme} title={theme === "dark" ? "Light mode" : "Dark mode"}>
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setShowNewChat(true)} title="New chat">
              <Plus className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleLogout} title="Logout">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search chats..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <Separator />

        <ScrollArea className="flex-1">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              <p>No conversations yet</p>
              <p className="text-xs mt-1">Press + to start a new chat</p>
            </div>
          ) : (
            filtered.map((chat) => {
              const name = getChatName(chat);
              const avatar = getChatAvatar(chat);
              const lastMsg = chat.messages[0];
              const isActive = pathname === `/chat/${chat.id}`;
              const otherId = getOtherId(chat);
              const isOnline = otherId ? onlineIds.has(otherId) : false;

              return (
                <Link key={chat.id} href={`/chat/${chat.id}`}>
                  <div className={cn("flex items-center gap-3 px-4 py-3 hover:bg-accent cursor-pointer transition-colors", isActive && "bg-accent")}>
                    <div className="relative shrink-0">
                      <Avatar className="h-11 w-11">
                        <AvatarImage src={avatar} />
                        <AvatarFallback>{initials(name)}</AvatarFallback>
                      </Avatar>
                      {isOnline && (
                        <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-card" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className={cn("font-medium text-sm truncate", chat.unreadCount > 0 && "font-semibold")}>{name}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {lastMsg && (
                            <span className="text-xs text-muted-foreground">
                              {new Date(lastMsg.createdAt).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                          {chat.unreadCount > 0 && (
                            <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold bg-primary text-primary-foreground rounded-full">
                              {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                      {lastMsg && (
                        <p className={cn("text-xs truncate", chat.unreadCount > 0 ? "text-foreground font-medium" : "text-muted-foreground")}>
                          {lastMsg.user.name}: {lastMsg.content}
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </ScrollArea>

        {me && (
          <>
            <Separator />
            <button
              onClick={() => setShowProfile(true)}
              className="w-full p-3 flex items-center gap-2 hover:bg-accent transition-colors rounded-b-none text-left"
            >
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage src={me.avatarUrl || ""} />
                <AvatarFallback className="text-xs">{initials(me.name)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{me.name}</p>
                {me.role === "ADMIN"
                  ? <span className="text-xs text-primary font-medium">Admin</span>
                  : me.role === "MODERATOR"
                  ? <span className="text-xs text-orange-500 font-medium">Moderator</span>
                  : <span className="text-xs text-muted-foreground">Edit profile</span>
                }
              </div>
            </button>
          </>
        )}
      </div>

      <NewChatDialog open={showNewChat} onOpenChange={setShowNewChat} onCreated={(id) => { loadChats(); router.push(`/chat/${id}`); }} />
      <ProfileEditDialog
        open={showProfile}
        onOpenChange={setShowProfile}
        onUpdated={(user) => setMe((prev) => prev ? { ...prev, ...user } : prev)}
      />
    </>
  );
}
