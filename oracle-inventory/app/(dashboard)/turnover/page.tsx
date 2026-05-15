"use client";

import TopBar from "@/components/TopBar";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { apiFetch } from "@/lib/auth";

interface Employee {
  id: string;
  name: string;
  employeeId: string;
  department: { name: string } | null;
  site: { name: string } | null;
  assignments: { id: string; asset: { id: string; name: string } }[];
}

const AVATAR_COLORS = ["#C6FF00", "#7B5CF5", "#3B82F6", "#22C55E", "#F59E0B", "#EC4899", "#14B8A6"];
const AVATAR_FG = ["#0F1112", "#fff", "#fff", "#fff", "#0F1112", "#fff", "#fff"];

export default function TurnoverPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchEmployees = useCallback(() => {
    setLoading(true);
    apiFetch("/api/employees")
      .then((r) => r.json())
      .then((data: Employee[]) => setEmployees(data.filter((e) => e.assignments.length > 0)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

  const filtered = employees.filter((e) =>
    !search ||
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.employeeId ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg)", borderRadius: 16 }}>
      <TopBar placeholder="Search employees…" title="Turnover" searchValue={search} onSearch={setSearch} />
      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px" }}>

        <div style={{ marginBottom: 14, fontSize: 13, color: "var(--muted-foreground)" }}>
          Select an employee to process their resignation and collect company assets.
        </div>

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[0, 1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 14 }}>
                  <Skeleton className="w-10 h-10 rounded-full" />
                  <div style={{ flex: 1 }}>
                    <Skeleton className="h-3.5 w-36 mb-2" />
                    <Skeleton className="h-2.5 w-24" />
                  </div>
                  <Skeleton className="h-6 w-20 rounded-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "48px 0", textAlign: "center", color: "var(--muted-foreground)", fontSize: 14 }}>
            {search ? "No employees match your search." : "No active employees with assigned assets."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map((e) => {
              const colorIdx = e.name.charCodeAt(0) % AVATAR_COLORS.length;
              const initials = e.name.split(" ").map((w) => w[0]).slice(0, 2).join("");
              return (
                <Card
                  key={e.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => router.push(`/turnover/resignation/${e.id}`)}
                >
                  <CardContent style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 14 }}>
                    <Avatar style={{ width: 40, height: 40, flexShrink: 0 }}>
                      <AvatarFallback style={{ background: AVATAR_COLORS[colorIdx], color: AVATAR_FG[colorIdx], fontWeight: 800, fontSize: 13 }}>
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{e.name}</div>
                      <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>
                        {e.employeeId}
                        {e.department ? ` · ${e.department.name}` : ""}
                        {e.site ? ` · ${e.site.name}` : ""}
                      </div>
                    </div>
                    <Badge style={{ background: "rgba(255,193,7,.1)", color: "#FFC107", borderColor: "transparent" }}>
                      {e.assignments.length} asset{e.assignments.length !== 1 ? "s" : ""}
                    </Badge>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ color: "var(--muted-foreground)", flexShrink: 0 }}>
                      <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
