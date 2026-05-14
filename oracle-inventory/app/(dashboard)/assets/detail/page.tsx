"use client";

import TopBar from "@/components/TopBar";
import Link from "next/link";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/auth";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Asset = {
  id: string;
  name: string;
  serialNumber: string | null;
  condition: string;
  ownership: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  category: { name: string } | null;
  site: { name: string } | null;
  assignments: {
    id: string;
    status: string;
    assignedAt: string;
    returnedAt: string | null;
    notes: string | null;
    employee: { id: string; name: string; employeeId: string | null };
  }[];
  movementLogs: {
    id: string;
    type: string;
    notes: string | null;
    createdAt: string;
    employee: { id: string; name: string } | null;
  }[];
};

function conditionBadge(condition: string) {
  switch (condition) {
    case "usable":
      return <Badge style={{ background: "rgba(198,255,0,.12)", color: "var(--lime)", borderColor: "transparent" }}>Usable</Badge>;
    case "for_repair":
      return <Badge style={{ background: "rgba(255,193,7,.1)", color: "#FFC107", borderColor: "transparent" }}>For Repair</Badge>;
    case "for_disposal":
      return <Badge style={{ background: "rgba(255,90,78,.12)", color: "var(--coral)", borderColor: "transparent" }}>For Disposal</Badge>;
    default:
      return <Badge variant="secondary">{condition}</Badge>;
  }
}

const MOVEMENT_LABELS: Record<string, string> = {
  assignment: "Assigned", transfer: "Transferred", site_transfer: "Site Transfer",
  resignation: "Resignation", new_hire: "New Hire", repair_send: "Sent for Repair",
  repair_return: "Returned from Repair", disposal: "Disposed",
};

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

function DetailSkeleton() {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg)", borderRadius: 16 }}>
      <div style={{ height: 60 }} />
      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
        <Card>
          <CardContent style={{ padding: 22 }}>
            <div className="flex justify-between mb-5">
              <div className="space-y-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <div className="grid grid-cols-4 gap-4">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-2.5 w-16" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent style={{ padding: 20 }}>
            <Skeleton className="h-4 w-32 mb-4" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AssetDetailContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";
  const router = useRouter();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    apiFetch(`/api/assets/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { setAsset(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/assets/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Asset deleted.");
        router.push("/assets");
      } else {
        toast.error("Failed to delete asset.");
        setShowDelete(false);
      }
    } catch {
      toast.error("Network error — check your connection.");
      setShowDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return <DetailSkeleton />;

  if (!asset) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", borderRadius: 16, color: "var(--muted-foreground)", fontSize: 14 }}>
        Asset not found.
      </div>
    );
  }

  const activeAssignment = asset.assignments.find((a) => a.status === "active");

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg)", borderRadius: 16 }}>
      <TopBar title={asset.name}>
        <Button variant="ghost" size="sm" render={<Link href={`/assets/edit?id=${id}`} />} className="rounded-full h-8 px-3.5 text-xs font-semibold text-muted-foreground hover:text-white border border-white/7">
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full h-8 px-3.5 text-xs font-semibold border border-white/7"
          style={{ color: "var(--coral)" }}
          onClick={() => setShowDelete(true)}
        >
          Delete
        </Button>
      </TopBar>

      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent showCloseButton={false} className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete asset?</DialogTitle>
            <DialogDescription>
              This will permanently remove <strong style={{ color: "#E8E8E8" }}>{asset?.name}</strong> and its movement history. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="border-white/10 text-muted-foreground hover:text-white" onClick={() => setShowDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete asset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px", display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Info card */}
        <Card>
          <CardContent style={{ padding: 22 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>{asset.name}</div>
                {asset.serialNumber && <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)", marginTop: 3 }}>{asset.serialNumber}</div>}
              </div>
              {conditionBadge(asset.condition)}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
              {[
                { label: "Category", value: asset.category?.name ?? "—" },
                { label: "Site", value: asset.site?.name ?? "—" },
                { label: "Ownership", value: asset.ownership.charAt(0).toUpperCase() + asset.ownership.slice(1) },
                { label: "Registered", value: fmt(asset.createdAt) },
              ].map((f) => (
                <div key={f.label}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>{f.label}</div>
                  <div style={{ fontSize: 13, color: "#fff", fontWeight: 600 }}>{f.value}</div>
                </div>
              ))}
            </div>

            {asset.description && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,.06)", fontSize: 13, color: "var(--muted-foreground)" }}>
                {asset.description}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Current assignment */}
        {activeAssignment && (
          <Card>
            <CardContent style={{ padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 14 }}>Currently Assigned To</div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: "9999px", background: "rgba(198,255,0,.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "var(--lime)", flexShrink: 0 }}>
                  {activeAssignment.employee.name.charAt(0)}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{activeAssignment.employee.name}</div>
                  {activeAssignment.employee.employeeId && <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2, fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)" }}>{activeAssignment.employee.employeeId}</div>}
                </div>
                <div style={{ marginLeft: "auto", textAlign: "right" }}>
                  <div style={{ fontSize: 10, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: ".05em" }}>Since</div>
                  <div style={{ fontSize: 13, color: "#fff", fontWeight: 600 }}>{fmt(activeAssignment.assignedAt)}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Movement history */}
        {asset.movementLogs.length > 0 && (
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,.06)", fontSize: 14, fontWeight: 700, color: "#fff" }}>Movement History</div>
            <Table>
              <TableHeader>
                <TableRow style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                  {["Event", "Employee", "Notes", "Date"].map((h) => (
                    <TableHead key={h} className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {asset.movementLogs.map((m) => (
                  <TableRow key={m.id} style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                    <TableCell className="font-semibold text-white text-xs">{MOVEMENT_LABELS[m.type] ?? m.type}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{m.employee?.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{m.notes ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{fmt(m.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function AssetDetailPage() {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <AssetDetailContent />
    </Suspense>
  );
}
