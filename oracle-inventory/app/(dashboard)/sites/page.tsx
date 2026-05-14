"use client";

import TopBar from "@/components/TopBar";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth";

// Static map positions keyed by site name (can be extended as sites are added)
const SITE_POSITIONS: Record<string, { left: string; top: string }> = {
  "Manila HQ": { left: "28%", top: "52%" },
  "Cebu Office": { left: "48%", top: "66%" },
  "Davao Hub": { left: "70%", top: "72%" },
};

const SITE_COLORS = ["var(--lime)", "var(--purple)", "#3B82F6", "#22C55E", "#F59E0B"];

interface Site {
  id: string;
  name: string;
  address: string | null;
  _count: { assets: number; employees: number };
}

export default function SitesPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/sites")
      .then((r) => r.json())
      .then((data) => {
        setSites(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const totalAssets = sites.reduce((sum, s) => sum + s._count.assets, 0);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg)", borderRadius: 16 }}>
      <TopBar placeholder="Search sites…" title="Sites" actionLabel="Add Site" />
      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px" }}>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
          {/* Map card */}
          <Card style={{ position: "relative", minHeight: 420, overflow: "hidden" }}>
            <CardContent style={{ padding: 20, height: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Coverage Map</span>
                <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                  {loading ? "Loading…" : `${sites.length} active site${sites.length !== 1 ? "s" : ""}`}
                </span>
              </div>
              <div style={{ position: "absolute", inset: 0, opacity: .05, backgroundImage: "radial-gradient(circle,#fff 1px,transparent 1px)", backgroundSize: "20px 20px", pointerEvents: "none" }} />
              <svg style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", opacity: .04 }} viewBox="0 0 600 400" width="600" height="400" fill="white">
                <ellipse cx="300" cy="200" rx="260" ry="160" />
              </svg>
              <div style={{ position: "relative", width: "100%", height: 340 }}>
                {!loading && sites.map((site, idx) => {
                  const pos = SITE_POSITIONS[site.name] ?? { left: `${20 + idx * 15}%`, top: `${40 + idx * 10}%` };
                  const color = SITE_COLORS[idx % SITE_COLORS.length];
                  return (
                    <div key={site.id} className="pin" style={{ left: pos.left, top: pos.top }}>
                      <div className="pin-lbl">{site.name} · {site._count.assets}</div>
                      <div className="pin-dot" style={{ background: color }} />
                    </div>
                  );
                })}
                <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} viewBox="0 0 100 100" preserveAspectRatio="none">
                  <path d="M28 52 L48 66 L70 72" stroke="rgba(255,255,255,.12)" strokeWidth=".4" strokeDasharray="2 2" fill="none" />
                  <path d="M28 52 L38 80" stroke="rgba(255,255,255,.08)" strokeWidth=".4" strokeDasharray="2 2" fill="none" />
                </svg>
              </div>
            </CardContent>
          </Card>

          {/* Site list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {loading ? (
              [0, 1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent style={{ padding: "16px 18px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                      <div>
                        <Skeleton className="h-3.5 w-24 mb-1.5" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                      <Skeleton className="h-6 w-10" />
                    </div>
                    <Skeleton className="h-1.5 w-full rounded-full" />
                    <Skeleton className="h-2.5 w-20 mt-1.5" />
                  </CardContent>
                </Card>
              ))
            ) : sites.length === 0 ? (
              <div style={{ textAlign: "center", color: "var(--muted-foreground)", paddingTop: 48, fontSize: 14 }}>No sites found.</div>
            ) : (
              sites.map((site, idx) => {
                const color = SITE_COLORS[idx % SITE_COLORS.length];
                const pct = totalAssets > 0 ? Math.round((site._count.assets / totalAssets) * 100) : 0;
                return (
                  <Card key={site.id}>
                    <CardContent style={{ padding: "16px 18px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{site.name}</div>
                          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>{site.address ?? "No address"}</div>
                        </div>
                        <span style={{ fontSize: 18, fontWeight: 800, color }}>{site._count.assets}</span>
                      </div>
                      <div style={{ height: 5, background: "rgba(255,255,255,.06)", borderRadius: "9999px", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: "9999px" }} />
                      </div>
                      <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 5 }}>{pct}% of total · {site._count.employees} employee{site._count.employees !== 1 ? "s" : ""}</div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
