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
import { UserProfileDialog } from "@/components/profile/UserProfileDialog";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";

interface Message {
  id: string;
  content: string;
  mediaUrl: string | null;
  userId: string;
  chatId?: string;
  createdAt: string;
  user: { id: string; name: string; nickname: string | null; avatarUrl: string | null };
}

interface Chat {
  id: string;
  name: string | null;
  isGroup: boolean;
  members: Array<{ user: { id: string; name: string; nickname: string | null; avatarUrl: string | null } }>;
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
      }
      setNextCursor(data.nextCursor);
    } catch (err: unknown) {
      if ((err as Error).message?.includes("Not a member")) router.push("/chat");
      setLoading(false);
    }
  }, [chatId, router]);

  useEffect(() => {
    setLoading(true);
    loadMessages();
    api.get<{ chat: Chat }>(`/api/chats/${chatId}`).then(({ chat }) => setChat(chat)).catch(() => {});
    api.get<{ user: Me }>("/api/auth/me").then(({ user }) => setMe(user)).catch(() => {});
  }, [chatId, loadMessages]);

  useEffect(() => {
    if (!socket) return;
    socket.emit("join:chat", chatId);

    socket.on("message:new", (msg: Message) => {
      if (msg.chatId && msg.chatId !== chatId) return;
      setMessages((prev) => [...prev, msg]);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    });

    socket.on("typing:user", ({ userId: uid, chatId: cid }: { userId: string; chatId: string }) => {
      if (cid !== chatId) return;
      setTypingUsers((prev) => (prev.includes(uid) ? prev : [...prev, uid]));
    });

    socket.on("typing:stopped", ({ userId: uid }: { userId: string }) => {
      setTypingUsers((prev) => prev.filter((id) => id !== uid));
    });

    return () => {
      socket.emit("leave:chat", chatId);
      socket.off("message:new");
      socket.off("typing:user");
      socket.off("typing:stopped");
    };
  }, [socket, chatId]);

  async function sendMessage(content: string, mediaUrl?: string) {
    const { message } = await api.post<{ message: Message }>(`/api/chats/${chatId}/messages`, { content, mediaUrl });
    socket?.emit("message:send", { chatId, content, mediaUrl, id: message.id });
  }

  function getChatName(): string {
    if (!chat || !me) return "Loading...";
    if (chat.isGroup) return chat.name || "Group";
    const other = chat.members.find((m) => m.user.id !== me.id);
    return other?.user.nickname ? `@${other.user.nickname}` : other?.user.name || "Chat";
  }

  function getChatAvatar(): string {
    if (!chat || !me || chat.isGroup) return "";
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
            <Avatar className="h-9 w-9">
              <AvatarImage src={getChatAvatar()} />
              <AvatarFallback className="text-xs">{chatName.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="text-left">
              <p className="font-semibold text-sm">{chatName}</p>
              {typingUsers.length > 0
                ? <p className="text-xs text-primary">typing...</p>
                : <p className="text-xs text-muted-foreground">View profile</p>
              }
            </div>
          </button>
        ) : (
          <>
            <Avatar className="h-9 w-9">
              <AvatarImage src={getChatAvatar()} />
              <AvatarFallback className="text-xs">{chatName.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-sm">{chatName}</p>
              {typingUsers.length > 0 && <p className="text-xs text-primary">typing...</p>}
            </div>
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="p-4 space-y-1">
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
                onUserClick={(uid) => setViewUserId(uid)}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <Separator />
      <MessageInput
        onSend={sendMessage}
        onTyping={(typing) => { if (typing) socket?.emit("typing:start", chatId); else socket?.emit("typing:stop", chatId); }}
      />

      <UserProfileDialog
        userId={viewUserId}
        onClose={() => setViewUserId(null)}
        onOpenChat={(id) => { setViewUserId(null); router.push(`/chat/${id}`); }}
      />
    </div>
  );
}
