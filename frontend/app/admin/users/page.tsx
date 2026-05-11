import { UserTable } from "@/components/admin/UserTable";

export default function AdminUsersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
        <p className="text-muted-foreground">Manage and moderate users</p>
      </div>
      <UserTable />
    </div>
  );
}
