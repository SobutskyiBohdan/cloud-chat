import { AdminLogsTable } from "@/components/admin/AdminLogsTable";

export default function AdminLogsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Logs</h1>
        <p className="text-muted-foreground">Admin action history</p>
      </div>
      <AdminLogsTable />
    </div>
  );
}
