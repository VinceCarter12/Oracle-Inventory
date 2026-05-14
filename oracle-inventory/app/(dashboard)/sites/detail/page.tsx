"use client";

import TopBar from "@/components/TopBar";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/lib/auth";

interface Site {
  id: string;
  name: string;
  address: string | null;
  departments: { id: string; name: string }[];
  _count: { assets: number; employees: number };
}

interface Asset {
  id: string;
  name: string;
  serialNumber: string | null;
  condition: string;
  category: { name: string } | null;
  assignments: { id: string; status: string; employee: { id: string; name: string } | null }[];
}

interface Employee {
  id: string;
  name: string;
  employeeId: string;
  department: { name: string } | null;
  assignments: { id: string }[];
}

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

function DetailSkeleton() {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg)", borderRadius: 16 }}>
      <div style={{ height: 60 }} />
      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
        <Card><CardContent style={{ padding: 22 }}><Skeleton className="h-5 w-40 mb-4" /><div className="grid grid-cols-4 gap-4">{[0,1,2,3].map(i=><div key={i}><Skeleton className="h-2.5 w-16 mb-1.5"/><Skeleton className="h-4 w-24"/></div>)}</div></CardContent></Card>
        <Card><CardContent style={{ padding: 20 }}><Skeleton className="h-4 w-32 mb-4" /><Skeleton className="h-12 w-full rounded-lg" /></CardContent></Card>
      </div>
    </div>
  );
}

function SiteDetailContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";
  const router = useRouter();
  const [site, setSite] = useState<Site | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    Promise.all([
      apiFetch(`/api/sites/${id}`).then(r => r.ok ? r.json() : null),
      apiFetch("/api/assets").then(r => r.json()),
      apiFetch("/api/employees").then(r => r.json()),
    ]).then(([siteData, assetsData, empData]) => {
      setSite(siteData);
      setAssets((assetsData as Asset[]).filter((a: Asset) => {
        // filter by siteId — we'll match by site name from the asset's site relation
        return true; // will filter below after we have site name
      }));
      setEmployees(empData);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  if (loading) return <DetailSkeleton />;

  if (!site) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", borderRadius: 16, color: "var(--muted-foreground)", fontSize: 14 }}>
        Site not found.
      </div>
    );
  }

  // Filter assets and employees by siteId — use the id param
  const siteAssets = assets.filter((a: any) => a.siteId === id || a.site?.name === site.name);
  const siteEmployees = employees.filter((e: any) => e.siteId === id || e.site?.name === site.name);

  const usable = siteAssets.filter(a => a.condition === "usable").length;
  const forRepair = siteAssets.filter(a => a.condition === "for_repair").length;
  const forDisposal = siteAssets.filter(a => a.condition === "for_disposal").length;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg)", borderRadius: 16 }}>
      <TopBar title={site.name}>
        <button
          type="button"
          onClick={() => router.back()}
          style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", color: "var(--muted-foreground)", borderRadius: "9999px", fontSize: 12, fontWeight: 600, padding: "0 14px", height: 32, cursor: "pointer" }}
        >
          ← Back
        </button>
      </TopBar>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px", display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Site info card */}
        <Card>
          <CardContent style={{ padding: 22 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 4 }}>{site.name}</div>
            {site.address && <div style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 18 }}>{site.address}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
              {[
                { label: "Total Assets", value: String(site._count.assets) },
                { label: "Employees", value: String(site._count.employees) },
                { label: "Departments", value: String(site.departments.length) },
                { label: "Usable", value: String(usable) },
              ].map((f) => (
                <div key={f.label}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>{f.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{f.value}</div>
                </div>
              ))}
            </div>

            {site.departments.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,.06)", display: "flex", gap: 8, flexWrap: "wrap" }}>
                {site.departments.map(d => (
                  <Badge key={d.id} style={{ background: "rgba(255,255,255,.07)", color: "#E8E8E8", borderColor: "transparent" }}>{d.name}</Badge>
                ))}
              </div>
            )}

            {(forRepair > 0 || forDisposal > 0) && (
              <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                {forRepair > 0 && <Badge style={{ background: "rgba(255,193,7,.1)", color: "#FFC107", borderColor: "transparent" }}>{forRepair} for repair</Badge>}
                {forDisposal > 0 && <Badge style={{ background: "rgba(255,90,78,.12)", color: "var(--coral)", borderColor: "transparent" }}>{forDisposal} for disposal</Badge>}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Assets at this site */}
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,.06)", fontSize: 14, fontWeight: 700, color: "#fff" }}>
            Assets at this Site
            <span style={{ color: "var(--muted-foreground)", fontWeight: 500 }}> · {siteAssets.length}</span>
          </div>
          {siteAssets.length === 0 ? (
            <div style={{ padding: "28px 20px", textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>No assets at this site.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                  {["Asset", "Serial No.", "Category", "Condition", "Assigned To"].map(h => (
                    <TableHead key={h} className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {siteAssets.map(a => {
                  const activeAssignment = a.assignments?.find(x => x.status === "active");
                  return (
                    <TableRow key={a.id} style={{ borderBottom: "1px solid rgba(255,255,255,.04)", cursor: "pointer" }}
                      onClick={() => router.push(`/assets/detail?id=${a.id}`)}>
                      <TableCell className="font-semibold text-white">{a.name}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{a.serialNumber ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{a.category?.name ?? "—"}</TableCell>
                      <TableCell>{conditionBadge(a.condition)}</TableCell>
                      <TableCell className="text-muted-foreground">{activeAssignment?.employee?.name ?? "Unassigned"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>

        {/* Employees at this site */}
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,.06)", fontSize: 14, fontWeight: 700, color: "#fff" }}>
            Employees at this Site
            <span style={{ color: "var(--muted-foreground)", fontWeight: 500 }}> · {siteEmployees.length}</span>
          </div>
          {siteEmployees.length === 0 ? (
            <div style={{ padding: "28px 20px", textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>No employees at this site.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                  {["Employee", "ID", "Department", "Assets"].map(h => (
                    <TableHead key={h} className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {siteEmployees.map(e => (
                  <TableRow key={e.id} style={{ borderBottom: "1px solid rgba(255,255,255,.04)", cursor: "pointer" }}
                    onClick={() => router.push(`/employees/detail?id=${e.id}`)}>
                    <TableCell className="font-semibold text-white">{e.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{e.employeeId}</TableCell>
                    <TableCell className="text-muted-foreground">{e.department?.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{e.assignments.length} active</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

      </div>
    </div>
  );
}

export default function SiteDetailPage() {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <SiteDetailContent />
    </Suspense>
  );
}
