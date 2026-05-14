import TopBar from "@/components/TopBar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function reportStatusBadge(status: string) {
  switch (status) {
    case "Active":
      return <Badge style={{ background: "rgba(198,255,0,.12)", color: "var(--lime)", borderColor: "transparent" }}>Active</Badge>;
    case "Pending":
      return <Badge style={{ background: "rgba(255,193,7,.1)", color: "#FFC107", borderColor: "transparent" }}>Pending</Badge>;
    case "Paused":
      return <Badge style={{ background: "rgba(255,255,255,.07)", color: "#6B7280", borderColor: "transparent" }}>Paused</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export default function ReportsPage() {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg)", borderRadius: 16 }}>
      <TopBar placeholder="Search reports…" title="Reports" actionLabel="Export CSV">
        <Button variant="ghost" size="sm" className="rounded-full h-8 px-3.5 text-xs font-semibold text-muted-foreground border border-white/7 hover:text-white">
          May 2026 ▾
        </Button>
      </TopBar>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px" }}>

        {/* KPI row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 14 }}>
          {[
            { label: "Total Assets", val: "248", badge: "▲ 4.2%", badgeStyle: { background: "rgba(198,255,0,.15)", color: "var(--lime)", borderColor: "transparent" } },
            { label: "Assigned", val: "184", badge: "74% rate", badgeStyle: { background: "rgba(198,255,0,.12)", color: "var(--lime)", borderColor: "transparent" } },
            { label: "For Repair", val: "31", badge: "▲ +4 this wk", badgeStyle: { background: "rgba(255,90,78,.12)", color: "var(--coral)", borderColor: "transparent" } },
            { label: "Disposal", val: "12", badge: "No change", badgeStyle: { background: "rgba(255,255,255,.08)", color: "#9CA3AF", borderColor: "transparent" } },
          ].map((k) => (
            <Card key={k.label}>
              <CardContent style={{ padding: "16px 18px" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: ".05em" }}>{k.label}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", marginTop: 6 }}>{k.val}</div>
                <Badge style={k.badgeStyle}>{k.badge}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts row */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 14 }}>
          <Card>
            <CardContent style={{ padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Movement by Month</div>
                <div style={{ display: "flex", gap: 12 }}>
                  {[["var(--lime)", "Transfers"], ["var(--purple)", "Returns"]].map(([c, l]) => (
                    <span key={l} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--muted-foreground)" }}>
                      <span style={{ width: 10, height: 10, background: c, borderRadius: 2, display: "inline-block" }} />{l}
                    </span>
                  ))}
                </div>
              </div>
              <svg viewBox="0 0 500 160" style={{ width: "100%", height: 160 }}>
                <defs>
                  <pattern id="hl2" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                    <line x1="0" y1="0" x2="0" y2="6" stroke="#C6FF00" strokeWidth="2.5" strokeOpacity=".85" />
                  </pattern>
                </defs>
                {[20, 60, 100, 140].map(y => <line key={y} x1="0" x2="500" y1={y} y2={y} stroke="rgba(255,255,255,.05)" />)}
                {[
                  [10, 50, 90, 42, 90, 50, "Jan", 42],
                  [92, 40, 100, 124, 80, 60, "Feb", 124],
                  [174, 55, 85, 206, 88, 52, "Mar", 206],
                  [256, 38, 102, 288, 75, 65, "Apr", 288],
                  [338, 22, 118, 370, 68, 72, "May", 370],
                ].map(([x1, y1, h1, x2, y2, h2, label, lx]) => (
                  <g key={label as string}>
                    <rect x={x1} y={y1} width="30" height={h1} rx="4" fill="url(#hl2)" />
                    <rect x={x2} y={y2} width="30" height={h2} rx="4" fill="#7B5CF5" opacity=".7" />
                    <text x={lx} y="158" fill="#4B5563" fontSize="9" textAnchor="middle">{label as string}</text>
                  </g>
                ))}
              </svg>
            </CardContent>
          </Card>

          <Card>
            <CardContent style={{ padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 14 }}>Top Categories</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  ["Laptops", 86, "72%", "var(--lime)"],
                  ["Monitors", 54, "54%", "var(--purple)"],
                  ["Peripherals", 62, "60%", "var(--lime)", .6],
                  ["Mobile", 28, "32%", "var(--purple)", .6],
                  ["Printers", 18, "22%", "#4B5563"],
                ].map(([label, count, w, color, op]) => (
                  <div key={label as string}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#9CA3AF", marginBottom: 4 }}>
                      <span>{label as string}</span><span style={{ color: "#fff", fontWeight: 700 }}>{count as number}</span>
                    </div>
                    <div style={{ height: 6, background: "rgba(255,255,255,.08)", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: w as string, background: color as string, borderRadius: 4, opacity: (op as number) ?? 1 }} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Scheduled reports table */}
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Scheduled Reports</span>
            <Button variant="ghost" size="sm" className="rounded-full h-7 px-3 text-xs font-semibold text-muted-foreground border border-white/7 hover:text-white">
              Manage
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                {["Report", "Cadence", "Recipients", "Last run", "Status"].map(h => (
                  <TableHead key={h} className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                ["Asset condition", "Weekly · Mon", "ops@oracle", "May 9", "Active"],
                ["Movement log", "Daily 8:00 AM", "it-leads@oracle", "May 12", "Active"],
                ["Assignment audit", "Monthly · 1st", "cfo@oracle", "May 1", "Pending"],
                ["Disposal queue", "Quarterly", "facilities@oracle", "Apr 1", "Paused"],
              ].map(([name, cadence, recip, last, status]) => (
                <TableRow key={name} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <TableCell className="font-semibold text-white">{name}</TableCell>
                  <TableCell className="text-muted-foreground">{cadence}</TableCell>
                  <TableCell className="text-muted-foreground">{recip}</TableCell>
                  <TableCell className="text-muted-foreground">{last}</TableCell>
                  <TableCell>{reportStatusBadge(status)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
