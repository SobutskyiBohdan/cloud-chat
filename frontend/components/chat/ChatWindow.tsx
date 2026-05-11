"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useSocket } from "@/components/providers/SocketProvider";
import { api } from "@/lib/api";
import { MessageInput } from "./MessageInput";
import { MessageBubble } from "./MessageBubble";
import type { Message } from "./MessageBubble";
import { UserProfileDialog } from "@/components/profile/UserProfileDialog";
import { GroupInfoDialog } from "./GroupInfoDialog";
import { ArrowLeft, Loader2, Users } from "lucide-react";
import Link from "next/link";

interface Chat {
  id: string;
  name: string | null;
  isGroup: boolean;
  avatarUrl: string | null;
  members: Array<{ id: string; role: string; user: { id: string; name: string; nickname: string | null; avatarUrl: string | null } }>;
}

interface Me { id: string; name: string }

export function ChatWindow({ chatId }: { chatId: string }) {
  const { socket } = useSocket();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [chat, setChat] = useState<Chat | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [viewUserId, setViewUserId] = useState<string | null>(null);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [otherOnline, setOtherOnline] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editMessage, setEditMessage] = useState<Message | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async (cursor?: string) => {
    try {
      const url = `/api/chats/${chatId}/messages${cursor ? `?cursor=${cursor}` : ""}`;
      const data = await api.get<{ messages: Message[]; nextCursor: string | null }>(url);
      if (cursor) {
        setMessages((prev) => [...data.messages, ...prev]);
      } else {
        setMessages(data.messages);
        setLoading(false);
        setTimeout(() => bottomRef.current?.scrollIntoView(), 50);
        api.patch(`/api/chats/${chatId}/read`).catch(() => {});
      }
      setNextCursor(data.nextCursor);
    } catch (err: unknown) {
      if ((err as Error).message?.includes("Not a member")) router.push("/chat");
      setLoading(false);
    }
  }, [chatId, router]);

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    setReplyTo(null);
    setEditMessage(null);
    loadMessages();
    api.get<{ chat: Chat }>(`/api/chats/${chatId}`).then(({ chat }) => setChat(chat)).catch(() => {});
    api.get<{ user: Me }>("/api/auth/me").then(({ user }) => setMe(user)).catch(() => {});
  }, [chatId, loadMessages]);

  useEffect(() => {
    if (!chat || !me || chat.isGroup) return;
    const other = chat.members.find((m) => m.user.id !== me.id);
    if (!other) return;
    api.get<{ onlineIds: string[] }>(`/api/users/online?ids=${other.user.id}`)
      .then(({ onlineIds }) => setOtherOnline(onlineIds.includes(other.user.id)))
      .catch(() => {});
  }, [chat, me]);

  useEffect(() => {
    if (!socket) return;
    socket.emit("join:chat", chatId);

    socket.on("message:new", (msg: Message) => {
      if (msg.chatId !== chatId) return;
      setMessages((prev) => [...prev, { ...msg, reactions: msg.reactions ?? [], replyTo: msg.replyTo ?? null }]);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      api.patch(`/api/chats/${chatId}/read`).catch(() => {});
    });

    socket.on("message:edited", ({ messageId, content, editedAt }: { chatId: string; messageId: string; content: string; editedAt: string }) => {
      setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, content, editedAt } : m));
    });

    socket.on("message:deleted", ({ messageId }: { chatId: string; messageId: string }) => {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    });

    socket.on("typing:user", ({ userId: uid, chatId: cid }: { userId: string; chatId: string }) => {
      if (cid !== chatId) return;
      setTypingUsers((prev) => (prev.includes(uid) ? prev : [...prev, uid]));
    });

    socket.on("typing:stopped", ({ userId: uid }: { userId: string }) => {
      setTypingUsers((prev) => prev.filter((id) => id !== uid));
    });

    socket.on("user:online", ({ userId: uid }: { userId: string }) => {
      setChat((c) => {
        if (!c || c.isGroup) return c;
        const otherId = c.members.find((m) => m.user.id !== me?.id)?.user.id;
        if (otherId === uid) setOtherOnline(true);
        return c;
      });
    });

    socket.on("user:offline", ({ userId: uid }: { userId: string }) => {
      setChat((c) => {
        if (!c || c.isGroup) return c;
        const otherId = c.members.find((m) => m.user.id !== me?.id)?.user.id;
        if (otherId === uid) setOtherOnline(false);
        return c;
      });
    });

    return () => {
      socket.emit("leave:chat", chatId);
      socket.off("message:new");
      socket.off("message:edited");
      socket.off("message:deleted");
      socket.off("typing:user");
      socket.off("typing:stopped");
      socket.off("user:online");
      socket.off("user:offline");
    };
  }, [socket, chatId, me]);

  async function sendMessage(content: string, mediaUrl?: string, mediaType?: string, mediaName?: string, replyToId?: string) {
    const { message } = await api.post<{ message: Message }>(`/api/chats/${chatId}/messages`, {
      content, mediaUrl, mediaType, mediaName, replyToId,
    });
    socket?.emit("message:send", { chatId, content, mediaUrl, mediaType, mediaName, replyToId, id: message.id });
    setReplyTo(null);
  }

  async function handleEditMessage(messageId: string, content: string) {
    const { message } = await api.patch<{ message: Message }>(`/api/chats/${chatId}/messages/${messageId}`, { content });
    setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, content: message.content, editedAt: message.editedAt } : m));
    socket?.emit("message:edited", { chatId, messageId, content: message.content, editedAt: message.editedAt });
    setEditMessage(null);
  }

  function getChatName(): string {
    if (!chat || !me) return "Loading...";
    if (chat.isGroup) return chat.name || "Group";
    const other = chat.members.find((m) => m.user.id !== me.id);
    return other?.user.nickname ? `@${other.user.nickname}` : other?.user.name || "Chat";
  }

  function getChatAvatar(): string {
    if (!chat) return "";
    if (chat.avatarUrl) return chat.avatarUrl;
    if (!me || chat.isGroup) return "";
    const other = chat.members.find((m) => m.user.id !== me.id);
    return other?.user.avatarUrl || "";
  }

  const chatName = getChatName();

  return (
    <div className="flex flex-col flex-1 h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-card">
        <Button variant="ghost" size="icon" className="md:hidden" asChild>
          <Link href="/chat"><ArrowLeft className="w-4 h-4" /></Link>
        </Button>

        {chat && !chat.isGroup ? (
          <button
            className="flex items-center gap-3 hover:bg-accent/50 rounded-lg px-2 py-1 -mx-2 transition-colors"
            onClick={() => {
              const other = chat.members.find((m) => m.user.id !== me?.id);
              if (other) setViewUserId(other.user.id);
            }}
          >
            <div className="relative shrink-0">
              <Avatar className="h-9 w-9">
                <AvatarImage src={getChatAvatar()} />
                <AvatarFallback className="text-xs">{chatName.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              {otherOnline && (
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-card" />
              )}
            </div>
            <div className="text-left">
              <p className="font-semibold text-sm">{chatName}</p>
              {typingUsers.length > 0
                ? <p className="text-xs text-primary">typing...</p>
                : <p className="text-xs text-muted-foreground">{otherOnline ? "Online" : "Offline"}</p>
              }
            </div>
          </button>
        ) : (
          <button
            className="flex items-center gap-3 hover:bg-accent/50 rounded-lg px-2 py-1 -mx-2 transition-colors"
            onClick={() => chat?.isGroup && setShowGroupInfo(true)}
          >
            <Avatar className="h-9 w-9 shrink-0">
              <AvatarImage src={getChatAvatar()} />
              <AvatarFallback className="text-xs">{chatName.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="text-left">
              <p className="font-semibold text-sm">{chatName}</p>
              {typingUsers.length > 0
                ? <p className="text-xs text-primary">typing...</p>
                : chat?.isGroup && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Users className="w-3 h-3" />{chat.members.length} members
                  </p>
                )
              }
            </div>
          </button>
        )}

        {chat?.isGroup && (
          <Button variant="ghost" size="icon" className="ml-auto" onClick={() => setShowGroupInfo(true)} title="Group info">
            <Users className="w-4 h-4" />
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="p-4 space-y-0">
            {nextCursor && (
              <div className="flex justify-center py-2">
                <Button variant="ghost" size="sm" onClick={() => loadMessages(nextCursor)}>Load older messages</Button>
              </div>
            )}
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isOwn={msg.userId === me?.id}
                currentUserId={me?.id}
                chatId={chatId}
                onUserClick={(uid) => setViewUserId(uid)}
                onDeleted={(id) => {
                  setMessages((prev) => prev.filter((m) => m.id !== id));
                  socket?.emit("message:deleted", { chatId, messageId: id });
                }}
                onReactionChange={(id, reactions) =>
                  setMessages((prev) => prev.map((m) => m.id === id ? { ...m, reactions } : m))
                }
                onReply={(msg) => { setEditMessage(null); setReplyTo(msg); }}
                onEdit={(msg) => { setReplyTo(null); setEditMessage(msg); }}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <Separator />
      <MessageInput
        chatId={chatId}
        onSend={sendMessage}
        onTyping={(typing) => { if (typing) socket?.emit("typing:start", chatId); else socket?.emit("typing:stop", chatId); }}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        editMessage={editMessage}
        onCancelEdit={() => setEditMessage(null)}
        onEdit={handleEditMessage}
      />

      <UserProfileDialog
        userId={viewUserId}
        onClose={() => setViewUserId(null)}
        onOpenChat={(id) => { setViewUserId(null); router.push(`/chat/${id}`); }}
      />

      {showGroupInfo && chat && me && (
        <GroupInfoDialog
          chat={chat}
          currentUserId={me.id}
          onClose={() => setShowGroupInfo(false)}
          onUpdated={(updated) => setChat(updated)}
        />
      )}
    </div>
  );
}
