"use client";

import TopBar from "@/components/TopBar";
import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/lib/auth";

interface Assignment {
  id: string;
  status: "active" | "returned" | "transferred";
  assignedAt: string;
  returnedAt: string | null;
  asset: {
    id: string;
    name: string;
    serialNumber: string | null;
    category: { id: string; name: string } | null;
    site: { id: string; name: string } | null;
  };
  employee: {
    id: string;
    name: string;
    employeeId: string;
    department: { id: string; name: string } | null;
    site: { id: string; name: string } | null;
  } | null;
}

function statusBadge(status: string) {
  switch (status) {
    case "active":
      return <Badge style={{ background: "rgba(198,255,0,.12)", color: "#C6FF00", borderColor: "transparent" }}>Active</Badge>;
    case "transferred":
      return <Badge style={{ background: "rgba(255,193,7,.1)", color: "#FFC107", borderColor: "transparent" }}>Transferred</Badge>;
    case "returned":
      return <Badge style={{ background: "rgba(255,255,255,.07)", color: "#6B7280", borderColor: "transparent" }}>Returned</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

const TABS = ["All", "Active", "Returned", "Transferred"];

export default function AssignmentsPage() {
  const [activeTab, setActiveTab] = useState("All");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/assignments")
      .then((r) => r.json())
      .then((data) => {
        setAssignments(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = assignments.filter((a) => {
    if (activeTab === "All") return true;
    return a.status === activeTab.toLowerCase();
  });

  const activeCount = assignments.filter((a) => a.status === "active").length;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg)", borderRadius: 16 }}>
      <TopBar placeholder="Search assignments…" title="Assignments" actionLabel="New Assignment">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-9 rounded-full px-1 gap-0.5" style={{ background: "#1E2124", border: "1px solid rgba(255,255,255,0.07)" }}>
            {TABS.map(t => (
              <TabsTrigger
                key={t}
                value={t}
                className="rounded-full px-3.5 h-7 text-xs font-semibold data-[state=active]:bg-white/8 data-[state=active]:text-white data-[state=inactive]:text-muted-foreground"
              >
                {t}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </TopBar>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px" }}>
        <div className="d-card" style={{ overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
              Active assignments{" "}
              <span style={{ color: "var(--muted-foreground)", fontWeight: 500 }}>
                · {loading ? "…" : activeCount}
              </span>
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              {["Dept ▾", "Site ▾", "Sort ▾"].map(f => (
                <Button key={f} variant="ghost" size="sm" className="rounded-full h-7 px-3 text-xs font-semibold text-muted-foreground border border-white/7 hover:text-white">
                  {f}
                </Button>
              ))}
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                {["Asset", "Serial No.", "Assignee", "Dept", "Site", "Since", "Status", ""].map(h => (
                  <TableHead key={h} className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                [0, 1, 2, 3, 4].map((i) => (
                  <TableRow key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    {[0, 1, 2, 3, 4, 5, 6, 7].map((j) => (
                      <TableCell key={j}><Skeleton className="h-3 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} style={{ textAlign: "center", color: "var(--muted-foreground)", padding: "32px 0" }}>
                    No assignments found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((a) => (
                  <TableRow key={a.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <TableCell className="font-semibold text-white">{a.asset.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{a.asset.serialNumber ?? "—"}</TableCell>
                    <TableCell style={{ color: "#E8E8E8" }}>{a.employee?.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{a.employee?.department?.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{a.asset.site?.name ?? a.employee?.site?.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(a.assignedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </TableCell>
                    <TableCell>{statusBadge(a.status)}</TableCell>
                    <TableCell className="text-muted-foreground text-right cursor-pointer">⋯</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 11, color: "var(--muted-foreground)" }}>
            <span>Showing {filtered.length} of {assignments.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
