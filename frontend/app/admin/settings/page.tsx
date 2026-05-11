import { GlobalSettingsPanel } from "@/components/admin/GlobalSettingsPanel";

export default function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Global Settings</h1>
        <p className="text-muted-foreground">Control application-wide configuration</p>
      </div>
      <GlobalSettingsPanel />
    </div>
  );
}
