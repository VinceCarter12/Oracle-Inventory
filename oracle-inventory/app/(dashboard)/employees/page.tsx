"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

interface LookupData {
  sites: { id: string; name: string }[];
  departments?: { id: string; name: string }[];
}

const EMPTY_FORM = { name: "", employeeId: "", email: "", phone: "", siteId: "", departmentId: "" };

export default function EmployeesPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [deptDropOpen, setDeptDropOpen] = useState(false);
  const deptRef = useRef<HTMLDivElement>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [lookup, setLookup] = useState<LookupData>({ sites: [] });

  function loadEmployees() {
    return apiFetch("/api/employees")
      .then((r) => r.json())
      .then((data) => { setEmployees(data); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    loadEmployees();
    apiFetch("/api/lookup")
      .then((r) => r.json())
      .then((data) => setLookup(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (deptRef.current && !deptRef.current.contains(e.target as Node)) {
        setDeptDropOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const uniqueDepts = Array.from(new Set(employees.map(e => e.department?.name).filter(Boolean))) as string[];

  const filtered = employees.filter((emp) => {
    if (filterDept && emp.department?.name !== filterDept) return false;
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

  async function handleSave() {
    if (!form.name.trim() || !form.employeeId.trim()) return;
    setSaving(true);
    try {
      const res = await apiFetch("/api/employees", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          employeeId: form.employeeId.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          siteId: form.siteId || null,
          departmentId: form.departmentId || null,
        }),
      });
      if (res.ok) {
        setShowModal(false);
        setForm(EMPTY_FORM);
        setLoading(true);
        loadEmployees();
      }
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    background: "rgba(255,255,255,.05)",
    border: "1px solid rgba(255,255,255,.1)",
    color: "#fff",
    borderRadius: 8,
    fontSize: 13,
  };

  const selectStyle = {
    ...inputStyle,
    height: 36,
    padding: "0 10px",
    width: "100%",
    appearance: "none" as const,
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg)", borderRadius: 16 }}>
      <TopBar
        placeholder="Search employees…"
        title="Employees"
        actionLabel="Add Employee"
        onAction={() => setShowModal(true)}
        searchValue={search}
        onSearch={setSearch}
      >
        <div style={{ position: "relative" }} ref={deptRef}>
          <Button
            variant="ghost" size="sm"
            className="rounded-full h-8 px-3.5 text-xs font-semibold text-muted-foreground border border-white/7 hover:text-white"
            onClick={() => setDeptDropOpen(!deptDropOpen)}
          >
            {filterDept || "All Depts"} ▾
          </Button>
          {deptDropOpen && (
            <div style={{ position: "absolute", right: 0, top: "110%", background: "#1E2124", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, padding: "6px 0", zIndex: 50, minWidth: 170, boxShadow: "0 8px 24px rgba(0,0,0,.4)" }}>
              {["", ...uniqueDepts].map(d => (
                <button key={d || "__all"} type="button"
                  onClick={() => { setFilterDept(d); setDeptDropOpen(false); }}
                  style={{ display: "block", width: "100%", textAlign: "left", background: filterDept === d ? "rgba(255,255,255,.08)" : "none", border: "none", cursor: "pointer", color: "#E8E8E8", fontSize: 13, padding: "8px 14px", fontWeight: 500 }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,.06)")}
                  onMouseLeave={e => (e.currentTarget.style.background = filterDept === d ? "rgba(255,255,255,.08)" : "none")}
                >
                  {d || "All Depts"}
                </button>
              ))}
            </div>
          )}
        </div>
      </TopBar>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px" }}>
        {/* KPI strip */}
        <div className="grid-kpi-3">
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
                          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", minWidth: 32, textAlign: "right" }}>
                            {assigned > 0 ? "100%" : "0%"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-full h-7 px-3 text-xs font-semibold text-muted-foreground hover:text-white border border-white/7"
                          onClick={() => router.push(`/employees/detail?id=${emp.id}`)}
                        >
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

      {/* Add Employee Modal */}
      <Dialog open={showModal} onOpenChange={(o) => { setShowModal(o); if (!o) setForm(EMPTY_FORM); }}>
        <DialogContent style={{ background: "#1A1D1F", border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, maxWidth: 480 }}>
          <DialogHeader>
            <DialogTitle style={{ color: "#fff", fontSize: 16, fontWeight: 800 }}>Add Employee</DialogTitle>
          </DialogHeader>

          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 4 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <Label style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: ".05em" }}>Full Name *</Label>
                <Input
                  style={inputStyle}
                  className="mt-1"
                  placeholder="Maria Santos"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <Label style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: ".05em" }}>Employee ID *</Label>
                <Input
                  style={inputStyle}
                  className="mt-1"
                  placeholder="EMP-006"
                  value={form.employeeId}
                  onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: ".05em" }}>Email</Label>
              <Input
                style={inputStyle}
                className="mt-1"
                placeholder="m.santos@company.com"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>

            <div>
              <Label style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: ".05em" }}>Phone</Label>
              <Input
                style={inputStyle}
                className="mt-1"
                placeholder="+63 9xx xxx xxxx"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>

            <div>
              <Label style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: ".05em" }}>Site</Label>
              <select
                style={selectStyle}
                className="mt-1"
                value={form.siteId}
                onChange={(e) => setForm({ ...form, siteId: e.target.value })}
              >
                <option value="">— Select site —</option>
                {lookup.sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
              <Button
                variant="ghost"
                className="rounded-full px-5 text-sm text-muted-foreground hover:text-white"
                onClick={() => { setShowModal(false); setForm(EMPTY_FORM); }}
              >
                Cancel
              </Button>
              <Button
                disabled={saving || !form.name.trim() || !form.employeeId.trim()}
                onClick={handleSave}
                style={{ background: "var(--lime)", color: "#0F1112", borderRadius: "9999px", fontWeight: 700, fontSize: 13, padding: "0 20px" }}
              >
                {saving ? "Saving…" : "Add Employee"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
