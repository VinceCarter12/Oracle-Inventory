"use client";

import TopBar from "@/components/TopBar";
import EmptyState from "@/components/EmptyState";
import Link from "next/link";
import { apiFetch } from "@/lib/auth";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

type Asset = {
  id: string;
  name: string;
  serialNumber: string | null;
  condition: string;
  ownership: string;
  category: { name: string } | null;
  site: { name: string } | null;
  assignments: { employee: { id: string; name: string } }[];
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

const PackageSearchIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 10.5V6.5L7 4l-4 2.5v5L7 14l4-2.5Z" />
    <path d="m7 4 4 2.5M7 4 3 6.5M7 9.5V14" />
    <path d="M3 6.5 7 9.5M11 6.5l4-2.5 4 2.5v5l-4 2.5-4-2.5v-5Z" />
    <path d="M15 4 19 6.5M15 4l4 2.5M19 6.5l-4 3M15 9.5V14" />
    <circle cx="17.5" cy="17.5" r="2.5" />
    <path d="m21 21-1.5-1.5" />
  </svg>
);

const CONDITIONS = [
  { value: "all", label: "All" },
  { value: "usable", label: "Usable" },
  { value: "for_repair", label: "Repair" },
  { value: "for_disposal", label: "Disposal" },
];

export default function AssetsPage() {
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [condition, setCondition] = useState("all");

  useEffect(() => {
    apiFetch("/api/assets")
      .then((r) => r.json())
      .then((data) => { setAssets(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = assets.filter((a) => {
    const matchSearch =
      !search ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      (a.serialNumber ?? "").toLowerCase().includes(search.toLowerCase());
    const matchCondition = condition === "all" || a.condition === condition;
    return matchSearch && matchCondition;
  });

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg)", borderRadius: 16 }}>
      <TopBar
        placeholder="Search assets…"
        title="Assets"
        actionLabel="Add Asset"
        onAction={() => router.push("/assets/new")}
        searchValue={search}
        onSearch={setSearch}
      >
        <Tabs value={condition} onValueChange={setCondition}>
          <TabsList className="h-9 rounded-full px-1 gap-0.5" style={{ background: "#1E2124", border: "1px solid rgba(255,255,255,0.07)" }}>
            {CONDITIONS.map((c) => (
              <TabsTrigger
                key={c.value}
                value={c.value}
                className="rounded-full px-3.5 h-7 text-xs font-semibold data-[state=active]:bg-white/8 data-[state=active]:text-white data-[state=inactive]:text-muted-foreground"
              >
                {c.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </TopBar>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px" }}>
        <div className="d-card" style={{ padding: 0, overflow: "hidden" }}>
          <Table>
            <TableHeader>
              <TableRow style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                {["Asset", "Serial No.", "Category", "Site", "Condition", "Ownership", "Assigned To", ""].map((h) => (
                  <TableHead key={h} className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-7 w-12 rounded-full" /></TableCell>
                </TableRow>
              ))}

              {!loading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="p-0">
                    <EmptyState
                      icon={<PackageSearchIcon />}
                      title="No assets found"
                      description="Try adjusting your filters or add a new asset."
                      action={{ label: "Add Asset", href: "/assets/new" }}
                    />
                  </TableCell>
                </TableRow>
              )}

              {filtered.map((a) => {
                const assignee = a.assignments[0]?.employee?.name ?? "—";
                return (
                  <TableRow key={a.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <TableCell className="font-semibold text-white">{a.name}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">{a.serialNumber ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{a.category?.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{a.site?.name ?? "—"}</TableCell>
                    <TableCell>{conditionBadge(a.condition)}</TableCell>
                    <TableCell className="text-muted-foreground capitalize">{a.ownership}</TableCell>
                    <TableCell style={{ color: assignee === "—" ? "var(--muted-foreground)" : "#fff" }}>{assignee}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" render={<Link href={`/assets/detail?id=${a.id}`} />} className="rounded-full h-7 px-3 text-xs font-semibold text-muted-foreground hover:text-white border border-white/7">
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
