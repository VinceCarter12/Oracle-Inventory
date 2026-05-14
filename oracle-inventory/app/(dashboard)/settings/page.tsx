"use client";

import TopBar from "@/components/TopBar";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const TABS = ["Profile", "Workspace", "Notifications", "Integrations", "Security", "Danger zone"];

const TOGGLES = [
  { label: "Asset returned", sub: "Notify when items are returned", on: true },
  { label: "Repair threshold", sub: "Alert when repair queue exceeds 30", on: true },
  { label: "Weekly digest", sub: "Summary every Monday", on: false },
  { label: "Disposal approvals", sub: "Require approval before retirement", on: true },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("Profile");
  const [switches, setSwitches] = useState(TOGGLES.map(t => t.on));

  function handleSave() {
    toast.success("Settings saved successfully.");
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg)", borderRadius: 16 }}>
      <TopBar placeholder="Search settings…" title="Settings" />
      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px" }}>

        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 12 }}>
          {/* Side nav */}
          <Card style={{ alignSelf: "start" }}>
            <CardContent style={{ padding: 10, display: "flex", flexDirection: "column", gap: 2 }}>
              {TABS.map(t => (
                <button
                  key={t}
                  className={`nav-tab${t === activeTab ? " on" : ""}`}
                  style={t === "Danger zone" ? { color: "var(--coral)" } : undefined}
                  onClick={() => setActiveTab(t)}
                >
                  {t}
                </button>
              ))}
            </CardContent>
          </Card>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Profile */}
            <Card>
              <CardContent style={{ padding: 22 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 18 }}>Profile</div>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
                  <Avatar style={{ width: 56, height: 56, flexShrink: 0 }}>
                    <AvatarFallback style={{ background: "var(--lime)", color: "#0F1112", fontSize: 18, fontWeight: 800 }}>
                      SJ
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <button style={{ fontSize: 12, fontWeight: 600, color: "var(--lime)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                      Upload photo
                    </button>
                    <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 3 }}>PNG or JPG, max 2MB</div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div>
                    <Label className="field-label">Full name</Label>
                    <Input className="field-input mt-1.5" defaultValue="Sir Jay" />
                  </div>
                  <div>
                    <Label className="field-label">Role</Label>
                    <Input className="field-input mt-1.5" defaultValue="Inventory Admin" />
                  </div>
                  <div style={{ gridColumn: "span 2" }}>
                    <Label className="field-label">Email</Label>
                    <Input className="field-input mt-1.5" defaultValue="jay@oracle.com" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Notifications */}
            <Card>
              <CardContent style={{ padding: 22 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 4 }}>Notifications</div>
                {TOGGLES.map((t, i) => (
                  <div key={t.label}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{t.label}</div>
                        <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>{t.sub}</div>
                      </div>
                      <Switch
                        checked={switches[i]}
                        onCheckedChange={(v) => setSwitches(s => s.map((val, j) => j === i ? v : val))}
                        style={switches[i] ? { background: "var(--lime)" } : undefined}
                      />
                    </div>
                    {i < TOGGLES.length - 1 && <Separator style={{ background: "rgba(255,255,255,.06)" }} />}
                  </div>
                ))}
              </CardContent>
            </Card>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <Button
                variant="ghost"
                className="rounded-full h-[34px] px-4 text-xs font-bold border border-white/7 text-muted-foreground hover:text-white"
              >
                Cancel
              </Button>
              <Button
                className="rounded-full h-[34px] px-4 text-xs font-bold"
                style={{ background: "var(--lime)", color: "#0F1112" }}
                onClick={handleSave}
              >
                Save changes
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
