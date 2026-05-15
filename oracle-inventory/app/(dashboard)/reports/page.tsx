"use client";

import TopBar from "@/components/TopBar";
import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

interface MonthData { month: string; assignments: number; returns: number; }
interface CategoryData { name: string; count: number; assigned: number; }
interface SummaryData {
  kpi: { totalAssets: number; assigned: number; forRepair: number; forDisposal: number };
  movementsByMonth: MonthData[];
  topCategories: CategoryData[];
}

function reportStatusBadge(status: string) {
  switch (status) {
    case "Active":
      return <Badge style={{ background: "rgba(198,255,0,.12)", color: "var(--lime)", borderColor: "transparent" }}>Active</Badge>;
    case "Pending":
      return <Badge style={{ background: "rgba(255,193,7,.1)", color: "#FFC107", borderColor: "transparent" }}>Pending</Badge>;
    case "Paused":
      return <Badge style={{ background: "rgba(255,255,255,.07)", color: "#6B7280", borderColor: "transparent" }}>Paused</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function KpiSkeleton() {
  return (
    <Card>
      <CardContent style={{ padding: "16px 18px" }}>
        <Skeleton className="h-3 w-24 mb-3" />
        <Skeleton className="h-7 w-16 mb-2" />
        <Skeleton className="h-5 w-20" />
      </CardContent>
    </Card>
  );
}

function ChartSkeleton() {
  return (
    <Card>
      <CardContent style={{ padding: 20 }}>
        <Skeleton className="h-4 w-40 mb-4" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </CardContent>
    </Card>
  );
}

export default function ReportsPage() {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(() => {
    setLoading(true);
    apiFetch("/api/reports/summary")
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  const handleExportCSV = useCallback(async () => {
    const assets = await apiFetch("/api/assets");
    const rows = [
      ["Name", "Serial Number", "Category", "Site", "Condition", "Ownership", "Assigned To"].join(","),
      ...assets.map((a: {
        name: string; serialNumber: string | null; category: { name: string } | null;
        site: { name: string } | null; condition: string; ownership: string;
        assignments: { employee: { name: string } }[];
      }) => [
        `"${a.name}"`,
        `"${a.serialNumber ?? ""}"`,
        `"${a.category?.name ?? ""}"`,
        `"${a.site?.name ?? ""}"`,
        a.condition,
        a.ownership,
        `"${a.assignments[0]?.employee?.name ?? ""}"`,
      ].join(","))
    ].join("\n");

    const blob = new Blob([rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `oracle-assets-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // Chart helpers
  const maxBarVal = data
    ? Math.max(...data.movementsByMonth.flatMap((m) => [m.assignments, m.returns]), 1)
    : 1;
  const barH = (val: number) => Math.round((val / maxBarVal) * 118);
  const barY = (val: number) => 138 - barH(val);

  const maxCat = data ? Math.max(...data.topCategories.map((c) => c.count), 1) : 1;

  const catColors = ["var(--lime)", "var(--purple)", "var(--lime)", "var(--purple)", "#6B7280"];
  const catOpacity = [1, 0.85, 0.6, 0.6, 1];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg)", borderRadius: 16 }}>
      <TopBar placeholder="Search reports…" title="Reports" actionLabel="Export CSV" onAction={handleExportCSV}>
        <Button variant="ghost" size="sm" className="rounded-full h-8 px-3.5 text-xs font-semibold text-muted-foreground border border-white/7 hover:text-white">
          Last 6 months
        </Button>
      </TopBar>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px" }}>

        {/* KPI row */}
        <div className="grid-kpi-4">
          {loading ? (
            <><KpiSkeleton /><KpiSkeleton /><KpiSkeleton /><KpiSkeleton /></>
          ) : (() => {
            const kpi = data!.kpi;
            const assignRate = kpi.totalAssets > 0 ? Math.round((kpi.assigned / kpi.totalAssets) * 100) : 0;
            return [
              { label: "Total Assets", val: kpi.totalAssets.toString(), badge: "All inventory", badgeStyle: { background: "rgba(255,255,255,.08)", color: "var(--muted-foreground)", borderColor: "transparent" } },
              { label: "Assigned", val: kpi.assigned.toString(), badge: `${assignRate}% rate`, badgeStyle: { background: "rgba(198,255,0,.12)", color: "var(--lime)", borderColor: "transparent" } },
              { label: "For Repair", val: kpi.forRepair.toString(), badge: "Needs attention", badgeStyle: { background: "rgba(255,90,78,.12)", color: "var(--coral)", borderColor: "transparent" } },
              { label: "Disposal", val: kpi.forDisposal.toString(), badge: "For disposal", badgeStyle: { background: "rgba(255,255,255,.08)", color: "var(--muted-foreground)", borderColor: "transparent" } },
            ].map((k) => (
              <Card key={k.label}>
                <CardContent style={{ padding: "16px 18px" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: ".05em" }}>{k.label}</div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{k.val}</div>
                  <Badge style={k.badgeStyle}>{k.badge}</Badge>
                </CardContent>
              </Card>
            ));
          })()}
        </div>

        {/* Charts row */}
        <div className="grid-report-charts">
          {loading ? <ChartSkeleton /> : (
            <Card>
              <CardContent style={{ padding: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Movement by Month</div>
                  <div style={{ display: "flex", gap: 12 }}>
                    {[["var(--lime)", "Assignments"], ["var(--purple)", "Returns"]].map(([c, l]) => (
                      <span key={l} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--muted-foreground)" }}>
                        <span style={{ width: 10, height: 10, background: c, borderRadius: 2, display: "inline-block" }} />{l}
                      </span>
                    ))}
                  </div>
                </div>
                <svg viewBox="0 0 500 160" style={{ width: "100%", height: 160 }}>
                  <defs>
                    <pattern id="hl2" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                      <line x1="0" y1="0" x2="0" y2="6" stroke="#C6FF00" strokeWidth="2.5" strokeOpacity=".85" />
                    </pattern>
                  </defs>
                  {[20, 60, 100, 140].map(y => <line key={y} x1="0" x2="500" y1={y} y2={y} stroke="rgba(255,255,255,.05)" />)}
                  {data!.movementsByMonth.map((m, i) => {
                    const slotW = 500 / data!.movementsByMonth.length;
                    const x1 = i * slotW + 4;
                    const x2 = i * slotW + 36;
                    const lx = i * slotW + slotW / 2;
                    const h1 = barH(m.assignments);
                    const h2 = barH(m.returns);
                    return (
                      <g key={m.month}>
                        <rect x={x1} y={barY(m.assignments)} width="28" height={Math.max(h1, 2)} rx="4" fill="url(#hl2)" />
                        <rect x={x2} y={barY(m.returns)} width="28" height={Math.max(h2, 2)} rx="4" fill="#7B5CF5" opacity=".7" />
                        <text x={lx} y="158" fill="#6B7280" fontSize="9" textAnchor="middle">{m.month}</text>
                      </g>
                    );
                  })}
                </svg>
              </CardContent>
            </Card>
          )}

          {loading ? <ChartSkeleton /> : (
            <Card>
              <CardContent style={{ padding: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 14 }}>Top Categories</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {data!.topCategories.map((cat, i) => (
                    <div key={cat.name}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--muted-foreground)", marginBottom: 4 }}>
                        <span>{cat.name}</span>
                        <span style={{ color: "#fff", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{cat.count}</span>
                      </div>
                      <div style={{ height: 6, background: "rgba(255,255,255,.08)", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{
                          height: "100%",
                          width: `${Math.round((cat.count / maxCat) * 100)}%`,
                          background: catColors[i] ?? "#6B7280",
                          borderRadius: 4,
                          opacity: catOpacity[i] ?? 1,
                        }} />
                      </div>
                    </div>
                  ))}
                  {data!.topCategories.length === 0 && (
                    <div style={{ fontSize: 13, color: "var(--muted-foreground)", textAlign: "center", padding: "20px 0" }}>No asset data yet</div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Scheduled reports table — static placeholder */}
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Scheduled Reports</span>
            <Button variant="ghost" size="sm" className="rounded-full h-7 px-3 text-xs font-semibold text-muted-foreground border border-white/7 hover:text-white">
              Manage
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                {["Report", "Cadence", "Recipients", "Last run", "Status"].map(h => (
                  <TableHead key={h} className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                ["Asset condition", "Weekly · Mon", "ops@oracle", "May 9", "Active"],
                ["Movement log", "Daily 8:00 AM", "it-leads@oracle", "May 12", "Active"],
                ["Assignment audit", "Monthly · 1st", "cfo@oracle", "May 1", "Pending"],
                ["Disposal queue", "Quarterly", "facilities@oracle", "Apr 1", "Paused"],
              ].map(([name, cadence, recip, last, status]) => (
                <TableRow key={name} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <TableCell className="font-semibold text-white">{name}</TableCell>
                  <TableCell className="text-muted-foreground">{cadence}</TableCell>
                  <TableCell className="text-muted-foreground">{recip}</TableCell>
                  <TableCell className="text-muted-foreground">{last}</TableCell>
                  <TableCell>{reportStatusBadge(status)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
