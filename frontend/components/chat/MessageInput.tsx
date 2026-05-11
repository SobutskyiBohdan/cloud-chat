"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { Send, Paperclip, X, Loader2, FileText, Pencil, Reply } from "lucide-react";
import Image from "next/image";
import type { Message } from "./MessageBubble";

interface Props {
  chatId: string;
  onSend: (content: string, mediaUrl?: string, mediaType?: string, mediaName?: string, replyToId?: string) => Promise<void>;
  onTyping: (typing: boolean) => void;
  replyTo?: Message | null;
  onCancelReply?: () => void;
  editMessage?: Message | null;
  onCancelEdit?: () => void;
  onEdit?: (messageId: string, content: string) => Promise<void>;
}

interface AttachedFile {
  url: string;
  mediaType: string;
  mediaName: string | null;
  previewUrl?: string;
}

export function MessageInput({ chatId, onSend, onTyping, replyTo, onCancelReply, editMessage, onCancelEdit, onEdit }: Props) {
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [attachment, setAttachment] = useState<AttachedFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (editMessage) {
      setContent(editMessage.content);
      textareaRef.current?.focus();
    }
  }, [editMessage]);

  useEffect(() => {
    if (replyTo) textareaRef.current?.focus();
  }, [replyTo]);

  const handleTyping = useCallback(() => {
    onTyping(true);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => onTyping(false), 2000);
  }, [onTyping]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      alert("File size must be under 25 MB");
      return;
    }
    setUploading(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const result = await api.post<{ url: string; mediaType: string; mediaName: string | null }>(
        `/api/chats/${chatId}/upload`,
        { data, mimeType: file.type, name: file.name }
      );
      const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
      setAttachment({ url: result.url, mediaType: result.mediaType, mediaName: result.mediaName || file.name, previewUrl });
    } catch {
      alert("Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function clearAttachment() {
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    setAttachment(null);
  }

  async function handleSend() {
    const text = content.trim();
    if ((!text && !attachment) || sending) return;

    setSending(true);
    onTyping(false);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);

    try {
      if (editMessage) {
        if (!text) return;
        await onEdit?.(editMessage.id, text);
        setContent("");
        onCancelEdit?.();
      } else {
        await onSend(text, attachment?.url, attachment?.mediaType, attachment?.mediaName ?? undefined, replyTo?.id);
        setContent("");
        clearAttachment();
        onCancelReply?.();
      }
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
    if (e.key === "Escape") {
      if (editMessage) onCancelEdit?.();
      else if (replyTo) onCancelReply?.();
    }
  }

  const canSend = (content.trim().length > 0 || !!attachment) && !sending && !uploading;

  return (
    <div className="bg-card">
      {replyTo && !editMessage && (
        <div className="flex items-center gap-2 px-3 pt-2 pb-1 border-t">
          <Reply className="w-4 h-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-primary truncate">
              {replyTo.user.nickname ? `@${replyTo.user.nickname}` : replyTo.user.name}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {replyTo.mediaUrl && !replyTo.content ? "📎 Attachment" : replyTo.content}
            </p>
          </div>
          <button onClick={onCancelReply} className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {editMessage && (
        <div className="flex items-center gap-2 px-3 pt-2 pb-1 border-t">
          <Pencil className="w-4 h-4 text-orange-500 shrink-0" />
          <p className="text-xs text-orange-500 font-medium flex-1">Editing message</p>
          <button onClick={() => { onCancelEdit?.(); setContent(""); }} className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {attachment && (
        <div className="flex items-center gap-2 px-3 pt-2 pb-1 border-t">
          {attachment.previewUrl ? (
            <Image src={attachment.previewUrl} alt="preview" width={40} height={40} className="rounded object-cover shrink-0" />
          ) : (
            <FileText className="w-8 h-8 text-muted-foreground shrink-0" />
          )}
          <span className="text-xs text-muted-foreground truncate flex-1">{attachment.mediaName}</span>
          <button onClick={clearAttachment} className="text-muted-foreground hover:text-destructive shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="p-3 flex gap-2 items-end">
        <input ref={fileRef} type="file" className="hidden" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar" onChange={handleFileChange} />
        <Button
          variant="ghost"
          size="icon"
          type="button"
          className="shrink-0"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || !!editMessage}
          title="Attach file"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
        </Button>
        <Textarea
          ref={textareaRef}
          placeholder={editMessage ? "Edit message..." : "Type a message..."}
          value={content}
          onChange={(e) => { setContent(e.target.value); handleTyping(); }}
          onKeyDown={handleKeyDown}
          rows={1}
          className="resize-none min-h-[40px] max-h-32 flex-1"
        />
        <Button size="icon" onClick={handleSend} disabled={!canSend} className="shrink-0">
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}
