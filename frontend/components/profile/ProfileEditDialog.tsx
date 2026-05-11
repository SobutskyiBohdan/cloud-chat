"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/use-toast";
import { useTheme } from "@/components/providers/ThemeProvider";
import { api } from "@/lib/api";
import { X, Camera, Loader2, Sun, Moon } from "lucide-react";

interface Me {
  id: string;
  name: string;
  email: string;
  nickname: string | null;
  avatarUrl: string | null;
  role: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (user: Me) => void;
}

export function ProfileEditDialog({ open, onOpenChange, onUpdated }: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();

  useEffect(() => {
    if (!open) return;
    api.get<{ user: Me }>("/api/auth/me").then(({ user }) => {
      setMe(user);
      setName(user.name);
      setNickname(user.nickname || "");
      setAvatarUrl(user.avatarUrl);
    }).catch(() => {});
  }, [open]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const { url } = await api.post<{ url: string }>("/api/users/avatar", { data });
      setAvatarUrl(url);
    } catch {
      toast({ title: "Upload failed", description: "Could not upload image", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { user } = await api.patch<{ user: Me }>("/api/users/profile", {
        name: name.trim(),
        nickname: nickname.trim() || null,
        avatarUrl,
      });
      onUpdated(user);
      onOpenChange(false);
      toast({ title: "Profile updated" });
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const initials = (me?.name || "?").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Edit Profile</h2>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              <Avatar className="h-20 w-20">
                <AvatarImage src={avatarUrl || ""} />
                <AvatarFallback className="text-xl">{initials}</AvatarFallback>
              </Avatar>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="absolute bottom-0 right-0 bg-primary text-primary-foreground rounded-full p-1.5 hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            <p className="text-xs text-muted-foreground">Click camera to change photo</p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="edit-nickname">Nickname</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm select-none">@</span>
              <Input
                id="edit-nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
                placeholder="optional_nickname"
                className="pl-7"
                maxLength={30}
              />
            </div>
            <p className="text-xs text-muted-foreground">Letters, numbers and underscores only</p>
          </div>

          <div className="space-y-1">
            <Label>Email</Label>
            <p className="text-sm text-muted-foreground px-1 py-1.5">{me?.email}</p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Theme</Label>
              <p className="text-xs text-muted-foreground">
                {theme === "dark" ? "Dark mode" : "Light mode"}
              </p>
            </div>
            <Button variant="outline" size="icon" onClick={toggleTheme} type="button">
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        <div className="p-4 border-t flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving || uploading}>
            {saving && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}
