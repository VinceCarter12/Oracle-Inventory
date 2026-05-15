"use client";

import TopBar from "@/components/TopBar";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { apiFetch } from "@/lib/auth";

interface Assignment {
  id: string;
  assignedAt: string;
  asset: {
    id: string;
    name: string;
    serialNumber: string | null;
    condition: string;
    ownership: string;
    category: { name: string } | null;
  };
}

interface Employee {
  id: string;
  name: string;
  employeeId: string;
  department: { name: string } | null;
  site: { name: string } | null;
  assignments: Assignment[];
}

const AVATAR_COLORS = ["#C6FF00", "#7B5CF5", "#3B82F6", "#22C55E", "#F59E0B", "#EC4899", "#14B8A6"];
const AVATAR_FG = ["#0F1112", "#fff", "#fff", "#fff", "#0F1112", "#fff", "#fff"];

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

function LoadingSkeleton() {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg)", borderRadius: 16 }}>
      <div style={{ height: 60 }} />
      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
        <Card>
          <CardContent style={{ padding: 22, display: "flex", alignItems: "center", gap: 16 }}>
            <Skeleton className="w-12 h-12 rounded-full" />
            <div style={{ flex: 1 }}>
              <Skeleton className="h-4 w-40 mb-2" />
              <Skeleton className="h-3 w-28" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent style={{ padding: 20 }}>
            <Skeleton className="h-4 w-48 mb-4" />
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg mb-2" />)}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function ResignationPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch(`/api/turnover/resignation/${params.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Employee | null) => {
        setEmployee(data);
        if (data) {
          const companyIds = new Set<string>(
            data.assignments
              .filter((a) => a.asset.ownership === "company")
              .map((a) => a.asset.id)
          );
          setChecked(companyIds);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [params.id]);

  function toggleAsset(assetId: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  }

  async function handleSubmit() {
    if (checked.size === 0) return;
    setSubmitting(true);
    try {
      const r = await apiFetch(`/api/turnover/resignation/${params.id}`, {
        method: "POST",
        body: JSON.stringify({ assetIds: [...checked] }),
      });
      if (!r.ok) {
        const err = await r.json();
        toast.error(err.error ?? "Failed to process resignation.");
        return;
      }
      toast.success(`Resignation processed. ${checked.size} asset${checked.size !== 1 ? "s" : ""} collected.`);
      router.push("/turnover");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingSkeleton />;

  if (!employee) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", borderRadius: 16, color: "var(--muted-foreground)", fontSize: 14 }}>
        Employee not found.
      </div>
    );
  }

  const colorIdx = employee.name.charCodeAt(0) % AVATAR_COLORS.length;
  const initials = employee.name.split(" ").map((w) => w[0]).slice(0, 2).join("");
  const companyAssets = employee.assignments.filter((a) => a.asset.ownership === "company");
  const personalAssets = employee.assignments.filter((a) => a.asset.ownership !== "company");

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg)", borderRadius: 16 }}>
      <TopBar title="Process Resignation">
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

        {/* Employee info */}
        <Card>
          <CardContent style={{ padding: 22, display: "flex", alignItems: "center", gap: 16 }}>
            <Avatar style={{ width: 52, height: 52, flexShrink: 0 }}>
              <AvatarFallback style={{ background: AVATAR_COLORS[colorIdx], color: AVATAR_FG[colorIdx], fontWeight: 800, fontSize: 16 }}>
                {initials}
              </AvatarFallback>
            </Avatar>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>{employee.name}</div>
              <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>
                {employee.employeeId}
                {employee.department ? ` · ${employee.department.name}` : ""}
                {employee.site ? ` · ${employee.site.name}` : ""}
              </div>
            </div>
            <Badge style={{ background: "rgba(255,90,78,.12)", color: "var(--coral)", borderColor: "transparent" }}>Resignation</Badge>
          </CardContent>
        </Card>

        {/* Company assets to collect */}
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
              Company Assets to Collect
              <span style={{ color: "var(--muted-foreground)", fontWeight: 500 }}> · {companyAssets.length}</span>
            </span>
            <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{checked.size} selected</span>
          </div>
          {companyAssets.length === 0 ? (
            <div style={{ padding: "28px 20px", textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>
              No company assets assigned.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {companyAssets.map((a) => (
                <label
                  key={a.id}
                  style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,.04)", cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={checked.has(a.asset.id)}
                    onChange={() => toggleAsset(a.asset.id)}
                    style={{ width: 16, height: 16, accentColor: "var(--lime)", flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{a.asset.name}</div>
                    <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>
                      {a.asset.serialNumber ?? "No S/N"} · {a.asset.category?.name ?? "Uncategorized"} · Since {fmt(a.assignedAt)}
                    </div>
                  </div>
                  <Badge style={{ background: "rgba(198,255,0,.12)", color: "var(--lime)", borderColor: "transparent" }}>Company</Badge>
                </label>
              ))}
            </div>
          )}
        </Card>

        {/* Personal property */}
        {personalAssets.length > 0 && (
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,.06)", fontSize: 14, fontWeight: 700, color: "#fff" }}>
              Personal Property
              <span style={{ color: "var(--muted-foreground)", fontWeight: 500 }}> · {personalAssets.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {personalAssets.map((a) => (
                <div
                  key={a.id}
                  style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,.04)", opacity: 0.6 }}
                >
                  <div style={{ width: 16, height: 16, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{a.asset.name}</div>
                    <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>
                      {a.asset.serialNumber ?? "No S/N"} · {a.asset.category?.name ?? "Uncategorized"}
                    </div>
                  </div>
                  <Badge style={{ background: "rgba(255,255,255,.07)", color: "#6B7280", borderColor: "transparent" }}>Do not collect</Badge>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Button
            variant="ghost"
            className="rounded-full h-[34px] px-4 text-xs font-bold border border-white/7 text-muted-foreground hover:text-white"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="rounded-full h-[34px] px-4 text-xs font-bold"
            disabled={checked.size === 0 || submitting}
            onClick={handleSubmit}
          >
            {submitting ? "Processing…" : `Process Resignation (${checked.size} asset${checked.size !== 1 ? "s" : ""})`}
          </Button>
        </div>

      </div>
    </div>
  );
}
