"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { Send, Paperclip, X, Loader2, FileText, Pencil, Reply, Mic, Timer, BarChart2, Plus, Trash2 } from "lucide-react";
import Image from "next/image";
import type { Message } from "./MessageBubble";
import { VoiceRecorder } from "./VoiceRecorder";

const EXPIRE_OPTIONS = [
  { label: "Off", value: null },
  { label: "30s", value: 30 },
  { label: "5m", value: 300 },
  { label: "1h", value: 3600 },
  { label: "1d", value: 86400 },
];

interface ChatMember {
  user: { id: string; name: string; nickname: string | null };
}

interface Props {
  chatId: string;
  members?: ChatMember[];
  onSend: (content: string, mediaUrl?: string, mediaType?: string, mediaName?: string, replyToId?: string, expiresIn?: number) => Promise<void>;
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

export function MessageInput({ chatId, members = [], onSend, onTyping, replyTo, onCancelReply, editMessage, onCancelEdit, onEdit }: Props) {
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [attachment, setAttachment] = useState<AttachedFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [expireIdx, setExpireIdx] = useState(0);
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<ChatMember[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeout = useRef<NodeJS.Timeout | null>(null);
  const mentionStart = useRef<number>(-1);

  useEffect(() => {
    if (editMessage) { setContent(editMessage.content); textareaRef.current?.focus(); }
  }, [editMessage]);

  useEffect(() => {
    if (replyTo) textareaRef.current?.focus();
  }, [replyTo]);

  const handleTyping = useCallback(() => {
    onTyping(true);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => onTyping(false), 2000);
  }, [onTyping]);

  function handleContentChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setContent(val);
    handleTyping();

    const cursor = e.target.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const match = before.match(/@([\w._-]*)$/);
    if (match) {
      mentionStart.current = cursor - match[0].length;
      const q = match[1].toLowerCase();
      setMentionQuery(q);
      const filtered = members.filter((m) => {
        const nick = m.user.nickname?.toLowerCase() || "";
        const name = m.user.name.toLowerCase();
        return nick.includes(q) || name.includes(q);
      }).slice(0, 5);
      setMentionResults(filtered);
    } else {
      setMentionQuery(null);
      setMentionResults([]);
    }
  }

  function insertMention(member: ChatMember) {
    const nick = member.user.nickname || member.user.name.replace(/\s+/g, "");
    const before = content.slice(0, mentionStart.current);
    const after = content.slice(textareaRef.current?.selectionStart ?? content.length);
    const newContent = `${before}@${nick} ${after}`;
    setContent(newContent);
    setMentionQuery(null);
    setMentionResults([]);
    setTimeout(() => {
      const pos = before.length + nick.length + 2;
      textareaRef.current?.setSelectionRange(pos, pos);
      textareaRef.current?.focus();
    }, 0);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) { alert("File size must be under 25 MB"); return; }
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

  async function handleVoiceRecorded(blob: Blob, _duration: number) {
    setShowVoice(false);
    setUploading(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const result = await api.post<{ url: string; mediaType: string; mediaName: string | null }>(
        `/api/chats/${chatId}/upload`,
        { data, mimeType: "audio/webm", name: `voice-${Date.now()}.webm` }
      );
      setAttachment({ url: result.url, mediaType: result.mediaType, mediaName: "Voice message" });
    } catch {
      alert("Voice upload failed");
    } finally {
      setUploading(false);
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
        const expiresIn = EXPIRE_OPTIONS[expireIdx].value ?? undefined;
        await onSend(text, attachment?.url, attachment?.mediaType, attachment?.mediaName ?? undefined, replyTo?.id, expiresIn);
        setContent("");
        clearAttachment();
        onCancelReply?.();
      }
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (mentionResults.length > 0 && (e.key === "Escape")) {
      setMentionQuery(null); setMentionResults([]); return;
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
    if (e.key === "Escape") {
      if (editMessage) onCancelEdit?.();
      else if (replyTo) onCancelReply?.();
    }
  }

  const canSend = (content.trim().length > 0 || !!attachment) && !sending && !uploading;
  const expiresIn = EXPIRE_OPTIONS[expireIdx];

  return (
    <div className="bg-card">
      {showPollCreator && (
        <PollCreator
          chatId={chatId}
          onClose={() => setShowPollCreator(false)}
        />
      )}

      {showVoice && (
        <VoiceRecorder
          onRecorded={handleVoiceRecorded}
          onCancel={() => setShowVoice(false)}
        />
      )}

      {replyTo && !editMessage && (
        <div className="flex items-center gap-2 px-3 pt-2 pb-1 border-t">
          <Reply className="w-4 h-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-primary truncate">{replyTo.user.nickname ? `@${replyTo.user.nickname}` : replyTo.user.name}</p>
            <p className="text-xs text-muted-foreground truncate">{replyTo.mediaUrl && !replyTo.content ? "📎 Attachment" : replyTo.content}</p>
          </div>
          <button onClick={onCancelReply} className="text-muted-foreground hover:text-foreground shrink-0"><X className="w-4 h-4" /></button>
        </div>
      )}

      {editMessage && (
        <div className="flex items-center gap-2 px-3 pt-2 pb-1 border-t">
          <Pencil className="w-4 h-4 text-orange-500 shrink-0" />
          <p className="text-xs text-orange-500 font-medium flex-1">Editing message</p>
          <button onClick={() => { onCancelEdit?.(); setContent(""); }} className="text-muted-foreground hover:text-foreground shrink-0"><X className="w-4 h-4" /></button>
        </div>
      )}

      {attachment && (
        <div className="flex items-center gap-2 px-3 pt-2 pb-1 border-t">
          {attachment.previewUrl
            ? <Image src={attachment.previewUrl} alt="preview" width={40} height={40} className="rounded object-cover shrink-0" />
            : <FileText className="w-8 h-8 text-muted-foreground shrink-0" />
          }
          <span className="text-xs text-muted-foreground truncate flex-1">{attachment.mediaName}</span>
          <button onClick={clearAttachment} className="text-muted-foreground hover:text-destructive shrink-0"><X className="w-4 h-4" /></button>
        </div>
      )}

      {mentionResults.length > 0 && mentionQuery !== null && (
        <div className="border-t bg-card px-2 py-1">
          {mentionResults.map((m) => (
            <button
              key={m.user.id}
              onMouseDown={(e) => { e.preventDefault(); insertMention(m); }}
              className="w-full text-left px-2 py-1 rounded hover:bg-accent text-sm flex items-center gap-2"
            >
              <span className="font-medium">{m.user.nickname ? `@${m.user.nickname}` : m.user.name}</span>
              {m.user.nickname && <span className="text-muted-foreground text-xs">{m.user.name}</span>}
            </button>
          ))}
        </div>
      )}

      <div className="p-3 flex gap-2 items-end">
        <input ref={fileRef} type="file" className="hidden" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar" onChange={handleFileChange} />

        <Button variant="ghost" size="icon" type="button" className="shrink-0" onClick={() => fileRef.current?.click()} disabled={uploading || !!editMessage} title="Attach file">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
        </Button>

        {!editMessage && (
          <Button variant="ghost" size="icon" type="button" className="shrink-0" onClick={() => { setShowVoice(true); setShowPollCreator(false); }} disabled={uploading || !!attachment} title="Voice message">
            <Mic className="w-4 h-4" />
          </Button>
        )}

        {!editMessage && (
          <Button variant="ghost" size="icon" type="button" className="shrink-0" onClick={() => { setShowPollCreator((p) => !p); setShowVoice(false); }} title="Create poll">
            <BarChart2 className="w-4 h-4" />
          </Button>
        )}

        {!editMessage && (
          <Button
            variant="ghost" size="icon" type="button"
            className={expiresIn.value ? "shrink-0 text-orange-500" : "shrink-0"}
            onClick={() => setExpireIdx((i) => (i + 1) % EXPIRE_OPTIONS.length)}
            title={`Disappearing: ${expiresIn.label}`}
          >
            <Timer className="w-4 h-4" />
            {expiresIn.value && <span className="absolute text-[8px] font-bold bottom-0.5 right-0.5">{expiresIn.label}</span>}
          </Button>
        )}

        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            placeholder={editMessage ? "Edit message..." : "Type a message..."}
            value={content}
            onChange={handleContentChange}
            onKeyDown={handleKeyDown}
            rows={1}
            className="resize-none min-h-[40px] max-h-32"
          />
        </div>

        <Button size="icon" onClick={handleSend} disabled={!canSend} className="shrink-0">
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}

// ─── Poll Creator ─────────────────────────────────────────────────────────────

function PollCreator({ chatId, onClose }: { chatId: string; onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multipleChoice, setMultipleChoice] = useState(false);
  const [sending, setSending] = useState(false);

  async function submit() {
    const q = question.trim();
    const opts = options.map((o) => o.trim()).filter(Boolean);
    if (!q || opts.length < 2) return;
    setSending(true);
    try {
      await api.post(`/api/chats/${chatId}/polls`, { question: q, options: opts, multipleChoice });
      onClose();
    } catch {
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-t p-3 space-y-2 bg-card">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
          <BarChart2 className="w-3 h-3" /> New Poll
        </span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
      </div>

      <input
        className="w-full text-sm bg-background border rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary"
        placeholder="Ask a question..."
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
      />

      <div className="space-y-1.5">
        {options.map((opt, i) => (
          <div key={i} className="flex gap-1.5">
            <input
              className="flex-1 text-sm bg-background border rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary"
              placeholder={`Option ${i + 1}`}
              value={opt}
              onChange={(e) => setOptions((prev) => prev.map((o, j) => j === i ? e.target.value : o))}
            />
            {options.length > 2 && (
              <button onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
        {options.length < 10 && (
          <button onClick={() => setOptions((p) => [...p, ""])} className="text-xs text-primary flex items-center gap-1 hover:underline">
            <Plus className="w-3 h-3" /> Add option
          </button>
        )}
      </div>

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={multipleChoice} onChange={(e) => setMultipleChoice(e.target.checked)} className="rounded" />
          Multiple choice
        </label>
        <Button size="sm" onClick={submit} disabled={sending || !question.trim() || options.filter(Boolean).length < 2}>
          {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Create Poll"}
        </Button>
      </div>
    </div>
  );
}
