import { StatsCharts } from "@/components/admin/StatsCharts";

export default function StatsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Real-time application statistics</p>
      </div>
      <StatsCharts />
    </div>
  );
}
