"use client";

import TopBar from "@/components/TopBar";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/auth";

interface Asset {
  id: string;
  condition: "usable" | "for_repair" | "for_disposal";
  assignments: { id: string; status: string }[];
}

interface KpiData {
  total: number;
  assigned: number;
  needsAttention: number;
}


function KpiSkeleton() {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <Skeleton className="h-3 w-28" />
        <div className="flex justify-between">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-8" />
        </div>
        <Skeleton className="h-1.5 w-full rounded-full" />
        <Skeleton className="h-6 w-16" />
        <div className="flex justify-between">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-10" />
        </div>
      </CardContent>
    </Card>
  );
}

function ChartSkeleton() {
  return (
    <Card>
      <CardContent className="p-5">
        <Skeleton className="h-4 w-40 mb-4" />
        <Skeleton className="h-[180px] w-full rounded-xl" />
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [kpi, setKpi] = useState<KpiData>({ total: 0, assigned: 0, needsAttention: 0 });

  useEffect(() => {
    apiFetch("/api/assets")
      .then((r) => r.json())
      .then((assets: Asset[]) => {
        const total = assets.length;
        const assigned = assets.filter((a) => a.assignments.some((x) => x.status === "active")).length;
        const needsAttention = assets.filter((a) => a.condition === "for_repair" || a.condition === "for_disposal").length;
        setKpi({ total, assigned, needsAttention });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!loading) {
      document.querySelectorAll<HTMLElement>(".progress-fill[data-w]").forEach((el) => {
        el.style.setProperty("--fill", "0");
        requestAnimationFrame(() => {
          el.style.setProperty("--fill", String(Number(el.dataset.w) / 100));
        });
      });
    }
  }, [loading]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg)", borderRadius: 16 }}>
      <TopBar title="Asset Overview" actionLabel="Add Asset">
        <Button
          size="sm"
          variant="outline"
          className="rounded-full gap-1.5 font-bold text-xs h-[34px] px-3.5 border-white/10 bg-card text-muted-foreground hover:text-white"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          May 2026
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="rounded-full gap-1.5 font-bold text-xs h-[34px] px-3.5 border-white/10 bg-card text-muted-foreground hover:text-white"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          All Sites
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </Button>
      </TopBar>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px" }}>

        {/* KPI row */}
        {(() => {
          const assignedPct = kpi.total > 0 ? Math.round((kpi.assigned / kpi.total) * 100) : 0;
          const attentionPct = kpi.total > 0 ? Math.round((kpi.needsAttention / kpi.total) * 100) : 0;
          const KPI_DATA = [
            { label: "Total Assets", fill: "linear-gradient(90deg,#3B82F6,#60A5FA)", w: kpi.total > 0 ? 83 : 0, amount: String(kpi.total), sub: "Inventory Count", pct: `${kpi.total} items`, pctColor: "#fff" },
            { label: "Assigned Assets", fill: "linear-gradient(90deg,#8BBF00,var(--lime))", w: assignedPct, amount: String(kpi.assigned), sub: "Active Assignments", pct: `${assignedPct}%`, pctColor: "#fff" },
            { label: "For Repair / Disposal", fill: "linear-gradient(90deg,#C53030,var(--coral))", w: attentionPct, amount: String(kpi.needsAttention), sub: "Requires Attention", pct: attentionPct > 20 ? "Over limit" : `${attentionPct}%`, pctColor: kpi.needsAttention > 0 ? "var(--coral)" : "var(--muted-foreground)" },
          ];
          return (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 14 }}>
              {loading
                ? [0, 1, 2].map(i => <KpiSkeleton key={i} />)
                : KPI_DATA.map((k) => (
                  <Card key={k.label} style={{ position: "relative", overflow: "hidden" }}>
                    <CardContent style={{ padding: "16px 18px" }}>
                      <div style={{ position: "absolute", top: 12, right: 12, width: 20, height: 20, borderRadius: "9999px", background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", color: "#4B5563", fontSize: 12 }}>×</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", letterSpacing: ".05em", textTransform: "uppercase" }}>{k.label}</div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
                        <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>Live count</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>{k.amount}</span>
                      </div>
                      <div className="progress-track">
                        <div className="progress-fill" data-w={k.w} style={{ background: k.fill }} />
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{k.amount}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>
                        <span>{k.sub}</span>
                        <span style={{ color: k.pctColor, fontWeight: 700 }}>{k.pct}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))
              }
            </div>
          );
        })()}

        {/* Charts grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

          {loading ? (
            <>
              <ChartSkeleton />
              <ChartSkeleton />
              <ChartSkeleton />
              <ChartSkeleton />
            </>
          ) : (
            <>
              {/* Bar chart */}
              <Card>
                <CardContent style={{ padding: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="9" r="3" stroke="var(--lime)" strokeWidth="2" /><path d="M3 20a6 6 0 0 1 12 0" stroke="var(--lime)" strokeWidth="2" strokeLinecap="round" fill="none" /></svg>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: "#fff", flex: 1 }}>New Asset Movements</h3>
                    <div style={{ display: "flex", gap: 12 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--muted-foreground)" }}><span style={{ width: 10, height: 10, borderRadius: "9999px", background: "var(--lime)", display: "inline-block" }} />Transfers</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--muted-foreground)" }}><span style={{ width: 10, height: 10, borderRadius: "9999px", background: "var(--purple)", display: "inline-block" }} />Returns</span>
                    </div>
                    <span style={{ color: "var(--muted-foreground)", fontSize: 18, cursor: "pointer" }}>···</span>
                  </div>
                  <svg viewBox="0 0 560 180" style={{ width: "100%", height: 180 }}>
                    <defs>
                      <pattern id="hatch-lime" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                        <line x1="0" y1="0" x2="0" y2="6" stroke="#C6FF00" strokeWidth="2.5" strokeOpacity=".85" />
                      </pattern>
                      <pattern id="hatch-purple" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                        <line x1="0" y1="0" x2="0" y2="6" stroke="#7B5CF5" strokeWidth="2.5" strokeOpacity=".85" />
                      </pattern>
                    </defs>
                    {[20, 52, 84, 116, 148].map(y => <line key={y} x1="40" x2="546" y1={y} y2={y} stroke="rgba(255,255,255,.06)" strokeWidth="1" />)}
                    {[["28%", 24], ["24%", 56], ["20%", 88], ["16%", 120], ["12%", 152]].map(([label, y]) => (
                      <text key={y as number} x="34" y={y as number} fill="#4B5563" fontSize="9" textAnchor="end">{label}</text>
                    ))}
                    <rect x="73" y="40" width="18" height="108" rx="4" fill="url(#hatch-lime)" />
                    <rect x="101" y="100" width="18" height="48" rx="4" fill="url(#hatch-purple)" />
                    <text x="98" y="165" fill="#4B5563" fontSize="9" textAnchor="middle">Sat</text>
                    <text x="98" y="175" fill="#6B7280" fontSize="8" textAnchor="middle">49</text>
                    <rect x="146" y="24" width="18" height="124" rx="4" fill="url(#hatch-lime)" />
                    <rect x="174" y="92" width="18" height="56" rx="4" fill="url(#hatch-purple)" />
                    <text x="171" y="165" fill="#4B5563" fontSize="9" textAnchor="middle">Sun</text>
                    <text x="171" y="175" fill="#6B7280" fontSize="8" textAnchor="middle">82</text>
                    <rect x="218" y="36" width="18" height="112" rx="4" fill="url(#hatch-lime)" />
                    <rect x="246" y="96" width="18" height="52" rx="4" fill="url(#hatch-purple)" />
                    <text x="244" y="165" fill="#4B5563" fontSize="9" textAnchor="middle">Mon</text>
                    <text x="244" y="175" fill="#6B7280" fontSize="8" textAnchor="middle">70</text>
                    <rect x="291" y="30" width="18" height="118" rx="4" fill="url(#hatch-lime)" />
                    <rect x="319" y="88" width="18" height="60" rx="4" fill="url(#hatch-purple)" />
                    <text x="316" y="165" fill="#4B5563" fontSize="9" textAnchor="middle">Tue</text>
                    <text x="316" y="175" fill="#6B7280" fontSize="8" textAnchor="middle">78</text>
                    <rect x="364" y="60" width="18" height="88" rx="4" fill="#7B5CF5" opacity=".85" />
                    <rect x="392" y="104" width="18" height="44" rx="4" fill="#7B5CF5" opacity=".45" />
                    <text x="389" y="165" fill="#4B5563" fontSize="9" textAnchor="middle">Wed</text>
                    <text x="389" y="175" fill="#6B7280" fontSize="8" textAnchor="middle">28</text>
                    <rect x="437" y="68" width="18" height="80" rx="4" fill="#7B5CF5" opacity=".85" />
                    <rect x="465" y="108" width="18" height="40" rx="4" fill="#7B5CF5" opacity=".45" />
                    <text x="462" y="165" fill="#4B5563" fontSize="9" textAnchor="middle">Thu</text>
                    <text x="462" y="175" fill="#6B7280" fontSize="8" textAnchor="middle">15</text>
                  </svg>
                </CardContent>
              </Card>

              {/* Donut chart */}
              <Card>
                <CardContent style={{ padding: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="var(--purple)" strokeWidth="2" fill="none" /></svg>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: "#fff", flex: 1 }}>Assignment Status</h3>
                    <div style={{ display: "flex", gap: 12 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--muted-foreground)" }}><span style={{ width: 10, height: 10, borderRadius: "9999px", background: "var(--lime)", display: "inline-block" }} />Assigned</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--muted-foreground)" }}><span style={{ width: 10, height: 10, borderRadius: "9999px", background: "var(--purple)", display: "inline-block" }} />Unassigned</span>
                    </div>
                    <span style={{ color: "var(--muted-foreground)", fontSize: 18, cursor: "pointer" }}>···</span>
                  </div>
                  {(() => {
                    const assignedPct = kpi.total > 0 ? Math.round((kpi.assigned / kpi.total) * 100) : 0;
                    const unassigned = kpi.total - kpi.assigned;
                    return (
                      <div style={{ display: "flex", gap: 24, justifyContent: "center", alignItems: "center", height: 180 }}>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 140, height: 140 }}>
                            <svg viewBox="0 0 140 140" width="140" height="140">
                              <circle cx="70" cy="70" r="52" fill="none" stroke="rgba(198,255,0,.12)" strokeWidth="18" />
                              <circle cx="70" cy="70" r="52" fill="none" stroke="var(--lime)" strokeWidth="18" strokeDasharray={`${Math.round((kpi.assigned / Math.max(kpi.total, 1)) * 326)} 326`} strokeLinecap="round" transform="rotate(-90 70 70)" />
                              <circle cx="70" cy="18" r="6" fill="#1E2124" stroke="var(--lime)" strokeWidth="2" />
                            </svg>
                            <div style={{ position: "absolute", textAlign: "center" }}>
                              <span style={{ display: "block", fontSize: 18, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{assignedPct}%</span>
                              <small style={{ fontSize: 10, color: "var(--muted-foreground)", fontWeight: 600 }}>Assigned</small>
                            </div>
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", marginTop: 6 }}>Assigned</div>
                          <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{kpi.assigned} of {kpi.total}</div>
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 120, height: 120 }}>
                            <svg viewBox="0 0 120 120" width="120" height="120">
                              <circle cx="60" cy="60" r="44" fill="none" stroke="rgba(123,92,245,.15)" strokeWidth="16" />
                              <circle cx="60" cy="60" r="44" fill="none" stroke="var(--purple)" strokeWidth="16" strokeDasharray={`${Math.round((unassigned / Math.max(kpi.total, 1)) * 276)} 276`} strokeLinecap="round" transform="rotate(-90 60 60)" />
                              <circle cx="60" cy="16" r="5" fill="#1E2124" stroke="var(--purple)" strokeWidth="2" />
                            </svg>
                            <div style={{ position: "absolute", textAlign: "center" }}>
                              <span style={{ display: "block", fontSize: 15, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{100 - assignedPct}%</span>
                              <small style={{ fontSize: 10, color: "var(--muted-foreground)", fontWeight: 600 }}>Open</small>
                            </div>
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", marginTop: 6 }}>Unassigned</div>
                          <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{unassigned} of {kpi.total}</div>
                        </div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>

              {/* Horizontal bars */}
              <Card>
                <CardContent style={{ padding: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 3v18h18" stroke="var(--lime)" strokeWidth="2" strokeLinecap="round" fill="none" /><rect x="7" y="8" width="14" height="4" rx="2" fill="var(--lime)" opacity=".4" /><rect x="7" y="14" width="9" height="4" rx="2" fill="var(--lime)" opacity=".4" /></svg>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: "#fff", flex: 1 }}>Inventory by Department</h3>
                    <div style={{ display: "flex", gap: 12 }}>
                      {[["var(--lime)", "IT"], ["var(--purple)", "Finance"], ["#4B5563", "Ops"]].map(([c, l]) => (
                        <span key={l} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--muted-foreground)" }}>
                          <span style={{ width: 10, height: 10, borderRadius: "9999px", background: c, display: "inline-block" }} />{l}
                        </span>
                      ))}
                    </div>
                    <span style={{ color: "var(--muted-foreground)", fontSize: 18, cursor: "pointer" }}>···</span>
                  </div>
                  {[
                    { label: "IT", segs: [["44%", "var(--lime)", ".9"], ["14%", "var(--purple)", ".7"], ["8%", "#4B5563", ".6"]], total: "86" },
                    { label: "Finance", segs: [["28%", "var(--lime)", ".9"], ["18%", "var(--purple)", ".7"], ["6%", "#4B5563", ".6"]], total: "52" },
                    { label: "Operations", segs: [["22%", "var(--lime)", ".9"], ["10%", "var(--purple)", ".7"], ["10%", "#4B5563", ".6"]], total: "42" },
                    { label: "Design", segs: [["18%", "var(--lime)", ".9"], ["8%", "var(--purple)", ".7"]], total: "26" },
                    { label: "Engineering", segs: [["16%", "var(--lime)", ".9"], ["6%", "var(--purple)", ".7"]], total: "22" },
                    { label: "HR", segs: [["10%", "var(--lime)", ".9"], ["4%", "var(--purple)", ".7"]], total: "20" },
                  ].map((row) => (
                    <div key={row.label} className="hbar-row">
                      <div className="hbar-label">{row.label}</div>
                      <div className="hbar-track">
                        {row.segs.map(([w, bg, op], i) => (
                          <div key={i} className="hbar-seg" style={{ width: w, background: bg, opacity: Number(op) }} />
                        ))}
                      </div>
                      <span style={{ fontSize: 11, color: "#fff", fontWeight: 700, minWidth: 28 }}>{row.total}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Area chart */}
              <Card>
                <CardContent style={{ padding: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 3v18h18" stroke="var(--purple)" strokeWidth="2" strokeLinecap="round" fill="none" /><rect x="7" y="12" width="3" height="6" rx="1" fill="var(--purple)" /><rect x="12" y="8" width="3" height="10" rx="1" fill="var(--purple)" /><rect x="17" y="5" width="3" height="13" rx="1" fill="var(--purple)" /></svg>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: "#fff", flex: 1 }}>Asset Health Trend</h3>
                    <span style={{ color: "var(--muted-foreground)", fontSize: 18, cursor: "pointer" }}>···</span>
                  </div>
                  <div style={{ position: "relative" }}>
                    <div style={{ position: "absolute", top: 0, right: 0, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>205</span>
                      <span className="badge badge-up">▲ 6%</span>
                    </div>
                    <div style={{ marginTop: 32 }}>
                      <svg viewBox="0 0 560 148" style={{ width: "100%", height: 148 }}>
                        <defs>
                          <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#7B5CF5" stopOpacity=".5" />
                            <stop offset="100%" stopColor="#7B5CF5" stopOpacity="0" />
                          </linearGradient>
                          <linearGradient id="area-lime" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#C6FF00" stopOpacity=".35" />
                            <stop offset="100%" stopColor="#C6FF00" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        {[30, 60, 90, 120].map(y => <line key={y} x1="0" x2="560" y1={y} y2={y} stroke="rgba(255,255,255,.05)" />)}
                        <path d="M0,120 L70,100 L140,95 L210,88 L280,80 L350,70 L420,75 L490,65 L560,58 L560,148 L0,148Z" fill="url(#area-grad)" />
                        <path d="M0,120 L70,100 L140,95 L210,88 L280,80 L350,70 L420,75 L490,65 L560,58" fill="none" stroke="var(--purple)" strokeWidth="2" />
                        <path d="M0,90 L70,78 L140,72 L210,60 L280,48 L350,42 L420,50 L490,38 L560,30 L560,148 L0,148Z" fill="url(#area-lime)" />
                        <path d="M0,90 L70,78 L140,72 L210,60 L280,48 L350,42 L420,50 L490,38 L560,30" fill="none" stroke="var(--lime)" strokeWidth="2" />
                        <circle cx="490" cy="38" r="5" fill="var(--lime)" />
                        {[["Jan", 0], ["Feb", 67], ["Mar", 134], ["Apr", 202], ["May", 274], ["Jun", 342], ["Jul", 406], ["Aug", 479]].map(([l, x]) => (
                          <text key={l} x={x as number} y="147" fill="#4B5563" fontSize="9">{l}</text>
                        ))}
                      </svg>
                    </div>
                    <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--muted-foreground)" }}><span style={{ width: 10, height: 10, borderRadius: "9999px", background: "var(--lime)", display: "inline-block" }} />Usable assets</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--muted-foreground)" }}><span style={{ width: 10, height: 10, borderRadius: "9999px", background: "var(--purple)", display: "inline-block" }} />Repair queue</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
