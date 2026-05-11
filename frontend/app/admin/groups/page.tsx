import { GroupTable } from "@/components/admin/GroupTable";

export default function AdminGroupsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Group Management</h1>
        <p className="text-muted-foreground">Moderate and manage group chats</p>
      </div>
      <GroupTable />
    </div>
  );
}
