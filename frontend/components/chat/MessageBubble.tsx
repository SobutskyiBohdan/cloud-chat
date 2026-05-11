"use client";

import { useState, useRef, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import Image from "next/image";
import { Trash2, Pencil, Reply, Smile, FileText, Download, Pin, PinOff, Clock } from "lucide-react";
import { VoiceMessagePlayer } from "./VoiceRecorder";
import { PollMessage, type Poll } from "./PollMessage";

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
  pinnedAt: string | null;
  expiresAt: string | null;
  replyTo: ReplyTo | null;
  user: { id: string; name: string; nickname: string | null; avatarUrl: string | null };
  reactions: Reaction[];
  mentions: { userId: string }[];
  poll: Poll | null;
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
  onPinToggle?: (messageId: string, pinnedAt: string | null) => void;
  readBy?: string[];
}

function MediaPreview({ url, type, name }: { url: string; type: string | null; name: string | null }) {
  if (type === "audio") return <VoiceMessagePlayer url={url} name={name} />;
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
      href={url} target="_blank" rel="noopener noreferrer" download={name || true}
      className="mb-2 flex items-center gap-2 bg-black/10 dark:bg-white/10 rounded-lg px-3 py-2 hover:bg-black/20 transition-colors"
    >
      <FileText className="w-5 h-5 shrink-0" />
      <span className="text-sm truncate max-w-[180px]">{name || "File"}</span>
      <Download className="w-4 h-4 shrink-0 ml-auto" />
    </a>
  );
}

function highlightMentions(text: string, mentionedIds: string[], currentUserId?: string) {
  if (!text.includes("@")) return <span className="whitespace-pre-wrap">{text}</span>;
  const parts = text.split(/(@[\w._-]+)/g);
  return (
    <span className="whitespace-pre-wrap">
      {parts.map((part, i) => {
        if (part.startsWith("@")) {
          return (
            <span key={i} className="font-semibold text-primary/90 bg-primary/10 rounded px-0.5">
              {part}
            </span>
          );
        }
        return part;
      })}
    </span>
  );
}

function DisappearingTimer({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) { clearInterval(id); return 0; }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [remaining]);

  const fmt = (s: number) => s >= 3600 ? `${Math.floor(s / 3600)}h` : s >= 60 ? `${Math.floor(s / 60)}m` : `${s}s`;

  return (
    <span className="flex items-center gap-0.5 text-[10px] opacity-60">
      <Clock className="w-2.5 h-2.5" />
      {remaining > 0 ? fmt(remaining) : "expiring"}
    </span>
  );
}

export function MessageBubble({ message, isOwn, currentUserId, chatId, onUserClick, onDeleted, onReactionChange, onReply, onEdit, onPinToggle, readBy }: Props) {
  const [showPicker, setShowPicker] = useState(false);
  const [poll, setPoll] = useState<Poll | null>(message.poll ?? null);
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
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowPicker(false);
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

  async function handlePin() {
    try {
      const { message: updated } = await api.post<{ message: Message }>(`/api/chats/${chatId}/messages/${message.id}/pin`, {});
      onPinToggle?.(message.id, updated.pinnedAt);
    } catch {}
  }

  const isPoll = message.mediaType === "poll";

  const ActionBar = () => (
    <div className={cn(
      "flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity self-end mb-1 shrink-0",
      isOwn ? "order-first mr-1" : "order-last ml-1"
    )}>
      {!isPoll && (
        <button onClick={() => onReply?.(message)} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" title="Reply">
          <Reply className="w-3.5 h-3.5" />
        </button>
      )}
      {!isPoll && (
        <div className="relative" ref={pickerRef}>
          <button onClick={() => setShowPicker((p) => !p)} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" title="React">
            <Smile className="w-3.5 h-3.5" />
          </button>
          {showPicker && (
            <div className={cn(
              "absolute bottom-full mb-1 flex gap-1 bg-card border rounded-full px-2 py-1.5 shadow-lg z-20 whitespace-nowrap",
              isOwn ? "right-0" : "left-0"
            )}>
              {EMOJIS.map((e) => (
                <button key={e} onClick={() => handleReact(e)} className="text-sm hover:scale-125 transition-transform leading-none">{e}</button>
              ))}
            </div>
          )}
        </div>
      )}
      <button
        onClick={handlePin}
        className={cn("p-1 rounded hover:bg-accent transition-colors", message.pinnedAt ? "text-primary" : "text-muted-foreground hover:text-foreground")}
        title={message.pinnedAt ? "Unpin" : "Pin"}
      >
        {message.pinnedAt ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
      </button>
      {isOwn && !isPoll && (
        <button onClick={() => onEdit?.(message)} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" title="Edit">
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}
      {isOwn && (
        <button onClick={handleDelete} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-destructive transition-colors" title="Delete">
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
            {message.replyTo && !isPoll && (
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

            {isPoll && poll ? (
              <PollMessage poll={poll} currentUserId={currentUserId} onUpdated={setPoll} />
            ) : (
              <>
                {message.mediaUrl && <MediaPreview url={message.mediaUrl} type={message.mediaType} name={message.mediaName} />}
                {message.content && highlightMentions(message.content, message.mentions.map((m) => m.userId), currentUserId)}
              </>
            )}

            <div className={cn("flex items-center gap-1 mt-1 justify-end", isOwn ? "text-primary-foreground/60" : "text-muted-foreground")}>
              {message.editedAt && <span className="text-[10px] italic">edited</span>}
              {message.expiresAt && <DisappearingTimer expiresAt={message.expiresAt} />}
              {message.pinnedAt && <Pin className="w-2.5 h-2.5 opacity-60" />}
              <span className="text-[10px]">{time}</span>
              {isOwn && readBy && readBy.length > 0 && (
                <span className="text-[10px] font-medium opacity-80">✓✓</span>
              )}
              {isOwn && (!readBy || readBy.length === 0) && (
                <span className="text-[10px] opacity-40">✓</span>
              )}
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
