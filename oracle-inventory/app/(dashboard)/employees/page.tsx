"use client";

import { useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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

const AVATAR_COLORS = [
  ["#C6FF00", "#0F1112"],
  ["#7B5CF5", "#fff"],
  ["#3B82F6", "#fff"],
  ["#22C55E", "#fff"],
  ["#F59E0B", "#0F1112"],
  ["#EC4899", "#fff"],
  ["#14B8A6", "#fff"],
];

interface Employee {
  id: string;
  name: string;
  employeeId: string;
  email: string | null;
  isActive: boolean;
  department: { id: string; name: string } | null;
  site: { id: string; name: string } | null;
  assignments: { id: string }[];
}

export default function EmployeesPage() {
  const [search, setSearch] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/employees")
      .then((r) => r.json())
      .then((data) => {
        setEmployees(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = employees.filter((emp) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      emp.name.toLowerCase().includes(q) ||
      emp.department?.name.toLowerCase().includes(q) ||
      emp.site?.name.toLowerCase().includes(q)
    );
  });

  const total = employees.length;
  const withAssets = employees.filter((e) => e.assignments.length > 0).length;
  const unassigned = total - withAssets;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg)", borderRadius: 16 }}>
      <TopBar
        placeholder="Search employees…"
        title="Employees"
        actionLabel="Add Employee"
        searchValue={search}
        onSearch={setSearch}
      >
        <Button variant="ghost" size="sm" className="rounded-full h-8 px-3.5 text-xs font-semibold text-muted-foreground border border-white/7 hover:text-white">
          All Depts ▾
        </Button>
      </TopBar>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px" }}>

        {/* KPI strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 14 }}>
          {loading ? (
            [0, 1, 2].map((i) => (
              <Card key={i}>
                <CardContent style={{ padding: "16px 18px" }}>
                  <Skeleton className="h-3 w-20 mb-2" />
                  <Skeleton className="h-7 w-14 mb-1" />
                  <Skeleton className="h-3 w-28" />
                </CardContent>
              </Card>
            ))
          ) : (
            [
              ["Total", String(total), "Across all departments"],
              ["With Assets", String(withAssets), `${total ? Math.round((withAssets / total) * 100) : 0}% coverage`],
              ["Unassigned", String(unassigned), "Pending onboarding"],
            ].map(([label, val, sub]) => (
              <Card key={label}>
                <CardContent style={{ padding: "16px 18px" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", marginTop: 4 }}>{val}</div>
                  <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>{sub}</div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Employee table */}
        <div className="d-card" style={{ padding: 0, overflow: "hidden" }}>
          <Table>
            <TableHeader>
              <TableRow style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                {["Employee", "Department", "Site", "Assets", "Utilization", ""].map((h) => (
                  <TableHead key={h} className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                [0, 1, 2, 3, 4].map((i) => (
                  <TableRow key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <TableCell>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
                        <Skeleton className="h-3.5 w-28" />
                      </div>
                    </TableCell>
                    {[0, 1, 2, 3, 4].map((j) => (
                      <TableCell key={j}><Skeleton className="h-3 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} style={{ textAlign: "center", padding: "40px 24px", color: "var(--muted-foreground)", fontSize: 13 }}>
                    {search ? `No employees match "${search}"` : "No employees found."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((emp, idx) => {
                  const [bg, fg] = AVATAR_COLORS[idx % AVATAR_COLORS.length];
                  const initials = emp.name.split(" ").map((w) => w[0]).slice(0, 2).join("");
                  const assigned = emp.assignments.length;
                  const maxSlots = Math.max(assigned, 1);
                  const pct = Math.round((assigned / maxSlots) * 100);
                  return (
                    <TableRow key={emp.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <TableCell>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <Avatar style={{ width: 32, height: 32, flexShrink: 0 }}>
                            <AvatarFallback style={{ background: bg, color: fg, fontWeight: 800, fontSize: 12 }}>
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-semibold text-white text-sm">{emp.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{emp.department?.name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{emp.site?.name ?? "—"}</TableCell>
                      <TableCell>
                        <span className="font-semibold text-white">{assigned}</span>
                        <span style={{ color: "var(--muted-foreground)", fontWeight: 400 }}> active</span>
                      </TableCell>
                      <TableCell>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,.06)", borderRadius: "9999px", overflow: "hidden", minWidth: 60 }}>
                            <div style={{ height: "100%", width: assigned > 0 ? "100%" : "0%", background: bg, borderRadius: "9999px" }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", minWidth: 32, textAlign: "right" }}>{pct}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="rounded-full h-7 px-3 text-xs font-semibold text-muted-foreground hover:text-white border border-white/7">
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
