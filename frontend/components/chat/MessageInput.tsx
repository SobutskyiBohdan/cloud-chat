"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Paperclip, Loader2 } from "lucide-react";

interface Props {
  onSend: (content: string, mediaUrl?: string) => Promise<void>;
  onTyping: (typing: boolean) => void;
}

export function MessageInput({ onSend, onTyping }: Props) {
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const typingTimeout = useRef<NodeJS.Timeout | null>(null);

  const handleTyping = useCallback(() => {
    onTyping(true);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => onTyping(false), 2000);
  }, [onTyping]);

  async function handleSend() {
    const text = content.trim();
    if (!text || sending) return;
    setSending(true);
    setContent("");
    onTyping(false);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    try {
      await onSend(text);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="p-3 flex gap-2 items-end bg-card">
      <Textarea
        placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
        value={content}
        onChange={(e) => { setContent(e.target.value); handleTyping(); }}
        onKeyDown={handleKeyDown}
        rows={1}
        className="resize-none min-h-[40px] max-h-32 flex-1"
      />
      <Button
        size="icon"
        onClick={handleSend}
        disabled={!content.trim() || sending}
        className="shrink-0"
      >
        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
      </Button>
    </div>
  );
}
