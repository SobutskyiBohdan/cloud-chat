"use client";

import { useState, useRef, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import Image from "next/image";
import { Trash2, Pencil, Reply, Smile, FileText, Download } from "lucide-react";

const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

interface Reaction { id: string; userId: string; emoji: string }

interface ReplyTo {
  id: string;
  content: string;
  mediaUrl: string | null;
  mediaType: string | null;
  user: { id: string; name: string; nickname: string | null };
}

export interface Message {
  id: string;
  content: string;
  mediaUrl: string | null;
  mediaType: string | null;
  mediaName: string | null;
  userId: string;
  chatId: string;
  createdAt: string;
  editedAt: string | null;
  replyTo: ReplyTo | null;
  user: { id: string; name: string; nickname: string | null; avatarUrl: string | null };
  reactions: Reaction[];
}

interface Props {
  message: Message;
  isOwn: boolean;
  currentUserId?: string;
  chatId: string;
  onUserClick?: (userId: string) => void;
  onDeleted?: (messageId: string) => void;
  onReactionChange?: (messageId: string, reactions: Reaction[]) => void;
  onReply?: (message: Message) => void;
  onEdit?: (message: Message) => void;
}

function MediaPreview({ url, type, name }: { url: string; type: string | null; name: string | null }) {
  if (!type || type === "image") {
    return (
      <div className="mb-2 rounded-lg overflow-hidden max-w-[260px]">
        <Image src={url} alt={name || "image"} width={260} height={180} className="object-cover w-full" />
      </div>
    );
  }
  if (type === "video") {
    return (
      <div className="mb-2 rounded-lg overflow-hidden max-w-[260px]">
        <video src={url} controls className="w-full rounded-lg max-h-48" />
      </div>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mb-2 flex items-center gap-2 bg-black/10 dark:bg-white/10 rounded-lg px-3 py-2 hover:bg-black/20 transition-colors"
      download={name || true}
    >
      <FileText className="w-5 h-5 shrink-0" />
      <span className="text-sm truncate max-w-[180px]">{name || "File"}</span>
      <Download className="w-4 h-4 shrink-0 ml-auto" />
    </a>
  );
}

export function MessageBubble({ message, isOwn, currentUserId, chatId, onUserClick, onDeleted, onReactionChange, onReply, onEdit }: Props) {
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const displayName = message.user.nickname ? `@${message.user.nickname}` : message.user.name;
  const time = new Date(message.createdAt).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
  const replyDisplayName = message.replyTo
    ? (message.replyTo.user.nickname ? `@${message.replyTo.user.nickname}` : message.replyTo.user.name)
    : null;

  const grouped = EMOJIS.reduce<Record<string, { count: number; mine: boolean }>>((acc, emoji) => {
    const matching = message.reactions.filter((r) => r.emoji === emoji);
    if (matching.length > 0) acc[emoji] = { count: matching.length, mine: matching.some((r) => r.userId === currentUserId) };
    return acc;
  }, {});

  useEffect(() => {
    if (!showPicker) return;
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showPicker]);

  async function handleReact(emoji: string) {
    setShowPicker(false);
    try {
      await api.post(`/api/chats/${chatId}/messages/${message.id}/react`, { emoji });
      const hasMine = message.reactions.some((r) => r.userId === currentUserId && r.emoji === emoji);
      const next = hasMine
        ? message.reactions.filter((r) => !(r.userId === currentUserId && r.emoji === emoji))
        : [...message.reactions, { id: Date.now().toString(), userId: currentUserId!, emoji }];
      onReactionChange?.(message.id, next);
    } catch {}
  }

  async function handleDelete() {
    if (!confirm("Delete this message?")) return;
    try {
      await api.delete(`/api/chats/${chatId}/messages/${message.id}`);
      onDeleted?.(message.id);
    } catch {}
  }

  const ActionBar = () => (
    <div className={cn(
      "flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity self-end mb-1 shrink-0",
      isOwn ? "order-first mr-1" : "order-last ml-1"
    )}>
      <button
        onClick={() => onReply?.(message)}
        className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        title="Reply"
      >
        <Reply className="w-3.5 h-3.5" />
      </button>
      <div className="relative" ref={pickerRef}>
        <button
          onClick={() => setShowPicker((p) => !p)}
          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title="React"
        >
          <Smile className="w-3.5 h-3.5" />
        </button>
        {showPicker && (
          <div className={cn(
            "absolute bottom-full mb-1 flex gap-1 bg-card border rounded-full px-2 py-1.5 shadow-lg z-20 whitespace-nowrap",
            isOwn ? "right-0" : "left-0"
          )}>
            {EMOJIS.map((e) => (
              <button key={e} onClick={() => handleReact(e)} className="text-sm hover:scale-125 transition-transform leading-none">
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
      {isOwn && (
        <button
          onClick={() => onEdit?.(message)}
          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title="Edit"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}
      {isOwn && (
        <button
          onClick={handleDelete}
          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-destructive transition-colors"
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );

  return (
    <div className={cn("flex gap-2 items-end mb-1 group", isOwn && "flex-row-reverse")}>
      {!isOwn && (
        <button onClick={() => onUserClick?.(message.userId)} className="shrink-0 mb-1 rounded-full">
          <Avatar className="h-7 w-7">
            <AvatarImage src={message.user.avatarUrl || ""} />
            <AvatarFallback className="text-xs">{message.user.name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
        </button>
      )}

      <div className={cn("max-w-[70%] flex flex-col", isOwn && "items-end")}>
        {!isOwn && (
          <button onClick={() => onUserClick?.(message.userId)} className="text-xs text-muted-foreground px-1 mb-0.5 hover:text-foreground transition-colors self-start">
            {displayName}
          </button>
        )}

        <div className="flex items-end gap-0">
          <ActionBar />

          <div className={cn(
            "rounded-2xl px-3 py-2 text-sm break-words min-w-0",
            isOwn ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted rounded-bl-sm"
          )}>
            {message.replyTo && (
              <div className={cn(
                "mb-2 rounded-lg px-2 py-1 text-xs border-l-2 opacity-80",
                isOwn ? "bg-primary-foreground/10 border-primary-foreground/40" : "bg-background/50 border-primary"
              )}>
                <p className="font-medium truncate">{replyDisplayName}</p>
                <p className="truncate text-xs opacity-75">
                  {message.replyTo.mediaUrl && !message.replyTo.content ? "📎 Attachment" : message.replyTo.content}
                </p>
              </div>
            )}

            {message.mediaUrl && (
              <MediaPreview url={message.mediaUrl} type={message.mediaType} name={message.mediaName} />
            )}

            {message.content && <p className="whitespace-pre-wrap">{message.content}</p>}

            <div className={cn("flex items-center gap-1 mt-1 justify-end", isOwn ? "text-primary-foreground/60" : "text-muted-foreground")}>
              {message.editedAt && <span className="text-[10px] italic">edited</span>}
              <span className="text-[10px]">{time}</span>
            </div>
          </div>
        </div>

        {Object.entries(grouped).length > 0 && (
          <div className={cn("flex flex-wrap gap-1 px-1 mt-1", isOwn && "justify-end")}>
            {Object.entries(grouped).map(([emoji, { count, mine }]) => (
              <button
                key={emoji}
                onClick={() => handleReact(emoji)}
                className={cn(
                  "flex items-center gap-0.5 text-xs rounded-full px-1.5 py-0.5 border transition-colors",
                  mine ? "bg-primary/10 border-primary/30" : "bg-muted border-transparent hover:border-border"
                )}
              >
                {emoji} <span className="text-muted-foreground">{count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
