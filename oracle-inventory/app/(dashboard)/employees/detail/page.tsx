"use client";

import TopBar from "@/components/TopBar";
import Link from "next/link";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/lib/auth";

interface Employee {
  id: string;
  name: string;
  employeeId: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  department: { id: string; name: string } | null;
  site: { id: string; name: string } | null;
  assignments: {
    id: string;
    status: string;
    assignedAt: string;
    returnedAt: string | null;
    asset: {
      id: string;
      name: string;
      serialNumber: string | null;
      condition: string;
      category: { name: string } | null;
    };
  }[];
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

function statusBadge(status: string) {
  switch (status) {
    case "active":
      return <Badge style={{ background: "rgba(198,255,0,.12)", color: "#C6FF00", borderColor: "transparent" }}>Active</Badge>;
    case "returned":
      return <Badge style={{ background: "rgba(255,255,255,.07)", color: "#6B7280", borderColor: "transparent" }}>Returned</Badge>;
    case "transferred":
      return <Badge style={{ background: "rgba(255,193,7,.1)", color: "#FFC107", borderColor: "transparent" }}>Transferred</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

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
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
              <Skeleton className="w-14 h-14 rounded-full" />
              <div>
                <Skeleton className="h-5 w-40 mb-2" />
                <Skeleton className="h-3 w-24" />
              </div>
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

const AVATAR_COLORS = ["#C6FF00", "#7B5CF5", "#3B82F6", "#22C55E", "#F59E0B", "#EC4899", "#14B8A6"];
const AVATAR_FG = ["#0F1112", "#fff", "#fff", "#fff", "#0F1112", "#fff", "#fff"];

function EmployeeDetailContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";
  const router = useRouter();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    apiFetch(`/api/employees/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { setEmployee(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  if (loading) return <DetailSkeleton />;

  if (!employee) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", borderRadius: 16, color: "var(--muted-foreground)", fontSize: 14 }}>
        Employee not found.
      </div>
    );
  }

  const colorIdx = employee.name.charCodeAt(0) % AVATAR_COLORS.length;
  const bg = AVATAR_COLORS[colorIdx];
  const fg = AVATAR_FG[colorIdx];
  const initials = employee.name.split(" ").map((w) => w[0]).slice(0, 2).join("");

  const activeAssets = employee.assignments.filter((a) => a.status === "active");
  const history = employee.assignments.filter((a) => a.status !== "active");

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg)", borderRadius: 16 }}>
      <TopBar title={employee.name}>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full h-8 px-3.5 text-xs font-semibold text-muted-foreground hover:text-white border border-white/7"
          onClick={() => router.back()}
        >
          ← Back
        </Button>
      </TopBar>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px", display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Profile card */}
        <Card>
          <CardContent style={{ padding: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
              <Avatar style={{ width: 56, height: 56, flexShrink: 0 }}>
                <AvatarFallback style={{ background: bg, color: fg, fontWeight: 800, fontSize: 18 }}>
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>{employee.name}</div>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontFamily: "monospace", marginTop: 3 }}>{employee.employeeId}</div>
              </div>
              <Badge style={{ background: employee.isActive ? "rgba(198,255,0,.12)" : "rgba(255,255,255,.07)", color: employee.isActive ? "var(--lime)" : "#6B7280", borderColor: "transparent" }}>
                {employee.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
              {[
                { label: "Department", value: employee.department?.name ?? "—" },
                { label: "Site", value: employee.site?.name ?? "—" },
                { label: "Email", value: employee.email ?? "—" },
                { label: "Phone", value: employee.phone ?? "—" },
              ].map((f) => (
                <div key={f.label}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>{f.label}</div>
                  <div style={{ fontSize: 13, color: "#fff", fontWeight: 600, wordBreak: "break-all" }}>{f.value}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Currently assigned assets */}
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
              Assigned Assets
              <span style={{ color: "var(--muted-foreground)", fontWeight: 500 }}> · {activeAssets.length}</span>
            </span>
          </div>
          {activeAssets.length === 0 ? (
            <div style={{ padding: "28px 20px", textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>
              No assets currently assigned.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                  {["Asset", "Serial No.", "Category", "Condition", "Since"].map((h) => (
                    <TableHead key={h} className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeAssets.map((a) => (
                  <TableRow key={a.id} style={{ borderBottom: "1px solid rgba(255,255,255,.04)", cursor: "pointer" }}
                    onClick={() => router.push(`/assets/detail?id=${a.asset.id}`)}>
                    <TableCell className="font-semibold text-white">{a.asset.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{a.asset.serialNumber ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{a.asset.category?.name ?? "—"}</TableCell>
                    <TableCell>{conditionBadge(a.asset.condition)}</TableCell>
                    <TableCell className="text-muted-foreground">{fmt(a.assignedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        {/* Assignment history */}
        {history.length > 0 && (
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,.06)", fontSize: 14, fontWeight: 700, color: "#fff" }}>
              Assignment History
            </div>
            <Table>
              <TableHeader>
                <TableRow style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                  {["Asset", "Serial No.", "Category", "Status", "Assigned", "Returned"].map((h) => (
                    <TableHead key={h} className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((a) => (
                  <TableRow key={a.id} style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                    <TableCell className="font-semibold text-white">{a.asset.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{a.asset.serialNumber ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{a.asset.category?.name ?? "—"}</TableCell>
                    <TableCell>{statusBadge(a.status)}</TableCell>
                    <TableCell className="text-muted-foreground">{fmt(a.assignedAt)}</TableCell>
                    <TableCell className="text-muted-foreground">{a.returnedAt ? fmt(a.returnedAt) : "—"}</TableCell>
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

export default function EmployeeDetailPage() {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <EmployeeDetailContent />
    </Suspense>
  );
}
