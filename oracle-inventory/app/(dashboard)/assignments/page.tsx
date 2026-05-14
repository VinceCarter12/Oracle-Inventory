"use client";

import TopBar from "@/components/TopBar";
import { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

interface LookupAsset {
  id: string;
  name: string;
  serialNumber: string | null;
}

interface LookupEmployee {
  id: string;
  name: string;
  employeeId: string;
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

const selectStyle = {
  background: "rgba(255,255,255,.05)",
  border: "1px solid rgba(255,255,255,.1)",
  color: "#fff",
  borderRadius: 8,
  fontSize: 13,
  height: 36,
  padding: "0 10px",
  width: "100%",
  appearance: "none" as const,
};

export default function AssignmentsPage() {
  const [activeTab, setActiveTab] = useState("All");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  // New Assignment modal
  const [showAssign, setShowAssign] = useState(false);
  const [assets, setAssets] = useState<LookupAsset[]>([]);
  const [employees, setEmployees] = useState<LookupEmployee[]>([]);
  const [assignForm, setAssignForm] = useState({ assetId: "", employeeId: "" });
  const [saving, setSaving] = useState(false);

  // Return / actions menu
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [returning, setReturning] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function loadAssignments() {
    return apiFetch("/api/assignments")
      .then((r) => r.json())
      .then((data) => { setAssignments(data); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    loadAssignments();
  }, []);

  // Close menu on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function openAssignModal() {
    setShowAssign(true);
    if (assets.length === 0) {
      const [aRes, lRes] = await Promise.all([
        apiFetch("/api/assets"),
        apiFetch("/api/lookup"),
      ]);
      const [aData, lData] = await Promise.all([aRes.json(), lRes.json()]);
      setAssets(aData.map((a: LookupAsset) => ({ id: a.id, name: a.name, serialNumber: a.serialNumber })));
      setEmployees(lData.employees ?? []);
    }
  }

  async function handleAssign() {
    if (!assignForm.assetId || !assignForm.employeeId) return;
    setSaving(true);
    try {
      const res = await apiFetch("/api/assignments", {
        method: "POST",
        body: JSON.stringify({ assetId: assignForm.assetId, employeeId: assignForm.employeeId }),
      });
      if (res.ok) {
        setShowAssign(false);
        setAssignForm({ assetId: "", employeeId: "" });
        setLoading(true);
        loadAssignments();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleReturn(assignmentId: string) {
    setReturning(assignmentId);
    setMenuOpenId(null);
    try {
      await apiFetch(`/api/assignments/${assignmentId}/return`, { method: "PUT" });
      loadAssignments();
    } finally {
      setReturning(null);
    }
  }

  const filtered = assignments.filter((a) => {
    if (activeTab === "All") return true;
    return a.status === activeTab.toLowerCase();
  });

  const activeCount = assignments.filter((a) => a.status === "active").length;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg)", borderRadius: 16 }}>
      <TopBar
        placeholder="Search assignments…"
        title="Assignments"
        actionLabel="New Assignment"
        onAction={openAssignModal}
      >
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
                    <TableCell className="text-right" style={{ position: "relative" }}>
                      {a.status === "active" ? (
                        <div style={{ position: "relative", display: "inline-block" }} ref={menuOpenId === a.id ? menuRef : null}>
                          <button
                            type="button"
                            onClick={() => setMenuOpenId(menuOpenId === a.id ? null : a.id)}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", fontSize: 18, padding: "2px 6px", borderRadius: 4, lineHeight: 1 }}
                          >
                            {returning === a.id ? "…" : "⋯"}
                          </button>
                          {menuOpenId === a.id && (
                            <div style={{ position: "absolute", right: 0, top: "100%", background: "#1E2124", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, padding: "6px 0", zIndex: 50, minWidth: 140, boxShadow: "0 8px 24px rgba(0,0,0,.4)" }}>
                              <button
                                type="button"
                                onClick={() => handleReturn(a.id)}
                                style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", color: "#E8E8E8", fontSize: 13, padding: "8px 14px", fontWeight: 500 }}
                                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,.06)")}
                                onMouseLeave={e => (e.currentTarget.style.background = "none")}
                              >
                                Return Asset
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: "var(--muted-foreground)", fontSize: 13 }}>—</span>
                      )}
                    </TableCell>
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

      {/* New Assignment Modal */}
      <Dialog open={showAssign} onOpenChange={(o) => { setShowAssign(o); if (!o) setAssignForm({ assetId: "", employeeId: "" }); }}>
        <DialogContent style={{ background: "#1A1D1F", border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, maxWidth: 440 }}>
          <DialogHeader>
            <DialogTitle style={{ color: "#fff", fontSize: 16, fontWeight: 800 }}>New Assignment</DialogTitle>
          </DialogHeader>

          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 4 }}>
            <div>
              <Label style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: ".05em" }}>Asset *</Label>
              <select
                style={selectStyle}
                className="mt-1"
                value={assignForm.assetId}
                onChange={(e) => setAssignForm({ ...assignForm, assetId: e.target.value })}
              >
                <option value="">— Select asset —</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}{a.serialNumber ? ` · ${a.serialNumber}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: ".05em" }}>Assign To *</Label>
              <select
                style={selectStyle}
                className="mt-1"
                value={assignForm.employeeId}
                onChange={(e) => setAssignForm({ ...assignForm, employeeId: e.target.value })}
              >
                <option value="">— Select employee —</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.employeeId})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
              <Button
                variant="ghost"
                className="rounded-full px-5 text-sm text-muted-foreground hover:text-white"
                onClick={() => { setShowAssign(false); setAssignForm({ assetId: "", employeeId: "" }); }}
              >
                Cancel
              </Button>
              <Button
                disabled={saving || !assignForm.assetId || !assignForm.employeeId}
                onClick={handleAssign}
                style={{ background: "var(--lime)", color: "#0F1112", borderRadius: "9999px", fontWeight: 700, fontSize: 13, padding: "0 20px" }}
              >
                {saving ? "Assigning…" : "Assign Asset"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
