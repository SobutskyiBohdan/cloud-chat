"use client";

import { useState, useRef, useEffect } from "react";
import { Mic, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  onRecorded: (blob: Blob, durationSec: number) => void;
  onCancel: () => void;
}

export function VoiceRecorder({ onRecorded, onCancel }: Props) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef(0);

  useEffect(() => {
    startRecording();
    return () => {
      timerRef.current && clearInterval(timerRef.current);
      recorderRef.current?.state === "recording" && recorderRef.current.stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const duration = Math.round((Date.now() - startTimeRef.current) / 1000);
        onRecorded(blob, duration);
      };
      recorderRef.current = recorder;
      recorder.start();
      startTimeRef.current = Date.now();
      setRecording(true);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      onCancel();
    }
  }

  function stopRecording() {
    timerRef.current && clearInterval(timerRef.current);
    recorderRef.current?.stop();
    setRecording(false);
  }

  function cancelRecording() {
    timerRef.current && clearInterval(timerRef.current);
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.ondataavailable = null;
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    onCancel();
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border-t border-red-500/20">
      <span className={cn("w-2 h-2 rounded-full bg-red-500 shrink-0", recording && "animate-pulse")} />
      <span className="text-sm font-mono text-red-500 w-12">{fmt(seconds)}</span>
      <span className="text-xs text-muted-foreground flex-1">Recording voice message...</span>
      <Button size="icon" variant="ghost" onClick={cancelRecording} className="h-7 w-7 text-muted-foreground">
        <X className="w-3.5 h-3.5" />
      </Button>
      <Button size="icon" onClick={stopRecording} className="h-7 w-7 bg-red-500 hover:bg-red-600">
        <Square className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

export function VoiceMessagePlayer({ url, name }: { url: string; name: string | null }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <Mic className="w-4 h-4 shrink-0 opacity-60" />
      <audio src={url} controls className="h-8 max-w-[220px]" style={{ minWidth: 160 }} />
      {name && <span className="text-xs opacity-60 truncate max-w-[80px]">{name}</span>}
    </div>
  );
}
