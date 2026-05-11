"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { BarChart2, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PollOption {
  id: string;
  text: string;
  votes: { userId: string }[];
}

export interface Poll {
  id: string;
  question: string;
  multipleChoice: boolean;
  expiresAt: string | null;
  options: PollOption[];
}

interface Props {
  poll: Poll;
  currentUserId?: string;
  onUpdated: (poll: Poll) => void;
}

export function PollMessage({ poll, currentUserId, onUpdated }: Props) {
  const [voting, setVoting] = useState<string | null>(null);

  const totalVotes = poll.options.reduce((s, o) => s + o.votes.length, 0);
  const isExpired = poll.expiresAt ? new Date(poll.expiresAt) < new Date() : false;
  const myVotedIds = poll.options
    .filter((o) => o.votes.some((v) => v.userId === currentUserId))
    .map((o) => o.id);

  async function vote(optionId: string) {
    if (isExpired || voting) return;
    setVoting(optionId);
    try {
      const { poll: updated } = await api.post<{ poll: Poll }>(`/api/polls/${poll.id}/vote`, { optionId });
      onUpdated(updated);
    } catch {
    } finally {
      setVoting(null);
    }
  }

  return (
    <div className="min-w-[220px] max-w-[280px]">
      <div className="flex items-center gap-1.5 mb-2 opacity-70">
        <BarChart2 className="w-3.5 h-3.5" />
        <span className="text-xs font-medium uppercase tracking-wide">
          {poll.multipleChoice ? "Multiple choice poll" : "Poll"}
        </span>
        {isExpired && (
          <span className="ml-auto text-xs flex items-center gap-0.5 text-destructive">
            <Clock className="w-3 h-3" /> Ended
          </span>
        )}
      </div>

      <p className="text-sm font-semibold mb-3 leading-snug">{poll.question}</p>

      <div className="space-y-1.5">
        {poll.options.map((opt) => {
          const pct = totalVotes > 0 ? Math.round((opt.votes.length / totalVotes) * 100) : 0;
          const voted = myVotedIds.includes(opt.id);
          return (
            <button
              key={opt.id}
              onClick={() => vote(opt.id)}
              disabled={isExpired || voting !== null}
              className={cn(
                "relative w-full text-left rounded-lg px-3 py-2 text-sm transition-colors overflow-hidden border",
                voted ? "border-primary/50" : "border-transparent hover:border-border",
                (isExpired || voting) && "cursor-default"
              )}
            >
              <span
                className={cn("absolute inset-0 rounded-lg transition-all", voted ? "bg-primary/15" : "bg-current/5")}
                style={{ width: `${pct}%`, opacity: 0.4 }}
              />
              <span className="relative flex items-center gap-2">
                {voted && <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />}
                <span className={cn("flex-1 truncate", voted && "text-primary font-medium")}>{opt.text}</span>
                <span className="text-xs opacity-60 shrink-0">{pct}%</span>
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-xs opacity-50 mt-2">{totalVotes} vote{totalVotes !== 1 ? "s" : ""}</p>
    </div>
  );
}
