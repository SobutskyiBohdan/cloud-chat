"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { api } from "@/lib/api";
import { Loader2, UserPlus, Wrench } from "lucide-react";

interface Settings { registrationEnabled: boolean; maintenanceMode: boolean }

export function GlobalSettingsPanel() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<Settings>({ registrationEnabled: true, maintenanceMode: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ settings: Settings }>("/api/admin/settings").then(({ settings }) => {
      setSettings(settings);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function update(key: keyof Settings, value: boolean) {
    setSaving(key);
    try {
      const { settings: updated } = await api.patch<{ settings: Settings }>("/api/admin/settings", { [key]: value });
      setSettings(updated);
      toast({ title: "Settings updated" });
    } catch {
      toast({ title: "Error updating settings", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  }

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><UserPlus className="w-5 h-5" />Registration</CardTitle>
          <CardDescription>Control whether new users can sign up</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="registration" className="text-base">Allow new registrations</Label>
              <p className="text-sm text-muted-foreground">
                {settings.registrationEnabled ? "New users can create accounts" : "Registration disabled — existing users only"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {saving === "registrationEnabled" && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
              <Switch id="registration" checked={settings.registrationEnabled} onCheckedChange={(v) => update("registrationEnabled", v)} disabled={saving !== null} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Wrench className="w-5 h-5" />Maintenance Mode</CardTitle>
          <CardDescription>Temporarily restrict chat access</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="maintenance" className="text-base">Enable maintenance mode</Label>
              <p className="text-sm text-muted-foreground">
                {settings.maintenanceMode ? "Chat access restricted — admins only" : "Application running normally"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {saving === "maintenanceMode" && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
              <Switch id="maintenance" checked={settings.maintenanceMode} onCheckedChange={(v) => update("maintenanceMode", v)} disabled={saving !== null} />
            </div>
          </div>
          {settings.maintenanceMode && (
            <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-200 rounded-lg text-sm">
              Maintenance mode is active. Regular users cannot access chats.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
