"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { api } from "@/lib/api";
import { Cloud, HardDrive, Trash2, RefreshCw, Loader2, AlertTriangle } from "lucide-react";

interface CloudinaryData {
  usage: { credits: { used: number; limit: number }; storage: { used: number; limit: number }; bandwidth: { used: number; limit: number } };
  totalAssets: number;
  totalBytes: number;
  orphanCount: number;
  orphanBytes: number;
  orphans: Array<{ public_id: string; secure_url: string; bytes: number; created_at: string; resource_type: string }>;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{formatBytes(used)} / {formatBytes(limit)}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct > 80 ? "bg-destructive" : pct > 50 ? "bg-yellow-500" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-right text-muted-foreground">{pct.toFixed(1)}%</p>
    </div>
  );
}

export default function CloudinaryPage() {
  const { toast } = useToast();
  const [data, setData] = useState<CloudinaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.get<CloudinaryData>("/api/admin/cloudinary");
      setData(result);
    } catch {
      toast({ title: "Failed to load Cloudinary data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  async function cleanOrphans() {
    if (!data || data.orphanCount === 0) return;
    if (!confirm(`Delete ${data.orphanCount} orphaned files (${formatBytes(data.orphanBytes)})?`)) return;
    setCleaning(true);
    try {
      const result = await api.delete<{ deleted: number }>("/api/admin/cloudinary/orphans");
      toast({ title: `Deleted ${result.deleted} orphaned files` });
      load();
    } catch {
      toast({ title: "Cleanup failed", variant: "destructive" });
    } finally {
      setCleaning(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cloudinary Storage</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage media assets and storage usage</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className="w-4 h-4 mr-2" />Refresh
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Cloud className="w-4 h-4" />
              <span className="text-xs">Total Assets</span>
            </div>
            <p className="text-2xl font-bold">{data.totalAssets}</p>
            <p className="text-xs text-muted-foreground">{formatBytes(data.totalBytes)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <HardDrive className="w-4 h-4" />
              <span className="text-xs">Storage Used</span>
            </div>
            <p className="text-2xl font-bold">{formatBytes(data.usage.storage.used)}</p>
            <p className="text-xs text-muted-foreground">of {formatBytes(data.usage.storage.limit)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <AlertTriangle className={`w-4 h-4 ${data.orphanCount > 0 ? "text-yellow-500" : ""}`} />
              <span className="text-xs">Orphaned Files</span>
            </div>
            <p className={`text-2xl font-bold ${data.orphanCount > 0 ? "text-yellow-500" : ""}`}>{data.orphanCount}</p>
            <p className="text-xs text-muted-foreground">{formatBytes(data.orphanBytes)} wasted</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Cloud className="w-4 h-4" />
              <span className="text-xs">Credits Used</span>
            </div>
            <p className="text-2xl font-bold">{data.usage.credits?.used ?? "—"}</p>
            <p className="text-xs text-muted-foreground">of {data.usage.credits?.limit ?? "—"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Usage meters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Usage Overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <UsageMeter label="Storage" used={data.usage.storage.used} limit={data.usage.storage.limit} />
          <UsageMeter label="Bandwidth" used={data.usage.bandwidth.used} limit={data.usage.bandwidth.limit} />
        </CardContent>
      </Card>

      {/* Orphan cleanup */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Orphaned Assets</CardTitle>
            {data.orphanCount > 0 && (
              <Button variant="destructive" size="sm" onClick={cleanOrphans} disabled={cleaning}>
                {cleaning ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                Delete All ({data.orphanCount})
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {data.orphanCount === 0 ? (
            <p className="text-muted-foreground text-sm">No orphaned assets found. Storage is clean.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground mb-3">
                Files in Cloudinary not referenced by any user avatar or message. Safe to delete.
              </p>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {data.orphans.map((asset) => (
                  <div key={asset.public_id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      {asset.resource_type === "image" && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={asset.secure_url} alt="" className="w-8 h-8 object-cover rounded shrink-0" />
                      )}
                      <span className="truncate text-muted-foreground">{asset.public_id}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <Badge variant="outline" className="text-xs">{asset.resource_type}</Badge>
                      <span className="text-muted-foreground">{formatBytes(asset.bytes)}</span>
                      <span className="text-muted-foreground hidden sm:inline">{new Date(asset.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
                {data.orphanCount > 50 && (
                  <p className="text-xs text-muted-foreground text-center pt-2">
                    Showing 50 of {data.orphanCount} orphaned files
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
