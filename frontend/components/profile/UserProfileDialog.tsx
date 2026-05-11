"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { api } from "@/lib/api";
import { X, MessageCircle, Loader2 } from "lucide-react";

interface UserProfile {
  id: string;
  name: string;
  nickname: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

interface Props {
  userId: string | null;
  onClose: () => void;
  onOpenChat?: (chatId: string) => void;
}

export function UserProfileDialog({ userId, onClose, onOpenChat }: Props) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (!userId) { setUser(null); return; }
    setLoading(true);
    api.get<{ user: UserProfile }>(`/api/users/${userId}`)
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [userId]);

  async function handleMessage() {
    if (!user || !onOpenChat) return;
    setOpening(true);
    try {
      const { chat } = await api.post<{ chat: { id: string } }>("/api/chats", {
        memberIds: [user.id],
        isGroup: false,
      });
      onClose();
      onOpenChat(chat.id);
    } finally {
      setOpening(false);
    }
  }

  if (!userId) return null;

  const initials = (user?.name || "?").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const memberSince = user
    ? new Date(user.createdAt).toLocaleDateString("uk-UA", { year: "numeric", month: "long", day: "numeric" })
    : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Profile</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : user ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <Avatar className="h-24 w-24">
                <AvatarImage src={user.avatarUrl || ""} />
                <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
              </Avatar>
              <div>
                <h3 className="text-xl font-semibold">{user.name}</h3>
                {user.nickname && (
                  <p className="text-sm text-muted-foreground mt-0.5">@{user.nickname}</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Member since {memberSince}</p>
              {onOpenChat && (
                <Button onClick={handleMessage} disabled={opening} className="w-full">
                  {opening
                    ? <Loader2 className="mr-2 w-4 h-4 animate-spin" />
                    : <MessageCircle className="mr-2 w-4 h-4" />
                  }
                  Send Message
                </Button>
              )}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">User not found</p>
          )}
        </div>
      </div>
    </div>
  );
}
