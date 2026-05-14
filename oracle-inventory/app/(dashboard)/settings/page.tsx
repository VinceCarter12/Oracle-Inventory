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

        <div className="grid-settings">
          {/* Side nav */}
          <Card style={{ alignSelf: "start" }}>
            <CardContent style={{ padding: 10, display: "flex", flexDirection: "column", gap: 2 }}>
              {TABS.map(t => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={t === activeTab}
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
            {activeTab === "Profile" && (
              <>
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
                    <div className="grid-form-2" style={{ gap: 14 }}>
                      <div>
                        <Label htmlFor="settings-name" className="field-label">Full name</Label>
                        <Input id="settings-name" className="field-input mt-1.5" defaultValue="Sir Jay" />
                      </div>
                      <div>
                        <Label htmlFor="settings-role" className="field-label">Role</Label>
                        <Input id="settings-role" className="field-input mt-1.5" defaultValue="Inventory Admin" />
                      </div>
                      <div style={{ gridColumn: "span 2" }}>
                        <Label htmlFor="settings-email" className="field-label">Email</Label>
                        <Input id="settings-email" className="field-input mt-1.5" defaultValue="jay@oracle.com" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <Button variant="ghost" className="rounded-full h-[34px] px-4 text-xs font-bold border border-white/7 text-muted-foreground hover:text-white">
                    Cancel
                  </Button>
                  <Button variant="lime" className="rounded-full h-[34px] px-4 text-xs font-bold" onClick={handleSave}>
                    Save changes
                  </Button>
                </div>
              </>
            )}

            {/* Notifications */}
            {activeTab === "Notifications" && (
              <>
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
                  <Button variant="ghost" className="rounded-full h-[34px] px-4 text-xs font-bold border border-white/7 text-muted-foreground hover:text-white">
                    Cancel
                  </Button>
                  <Button variant="lime" className="rounded-full h-[34px] px-4 text-xs font-bold" onClick={handleSave}>
                    Save changes
                  </Button>
                </div>
              </>
            )}

            {/* Danger zone */}
            {activeTab === "Danger zone" && (
              <Card style={{ border: "1px solid rgba(255,90,78,0.25)" }}>
                <CardContent style={{ padding: 22 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--coral)", marginBottom: 4 }}>Danger Zone</div>
                  <div style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 16 }}>These actions are irreversible. Proceed with caution.</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {[
                      { label: "Reset all assignments", sub: "Clears all active and historical assignment records." },
                      { label: "Export and delete all data", sub: "Downloads a full backup, then wipes the database." },
                    ].map((action) => (
                      <div key={action.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "rgba(255,90,78,0.06)", borderRadius: 10, border: "1px solid rgba(255,90,78,0.12)" }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{action.label}</div>
                          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>{action.sub}</div>
                        </div>
                        <Button variant="destructive" size="sm" className="rounded-full h-8 px-4 text-xs font-bold ml-4 flex-shrink-0">
                          Proceed
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Workspace */}
            {activeTab === "Workspace" && (
              <>
                <Card>
                  <CardContent style={{ padding: 22 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 18 }}>Workspace</div>
                    <div className="grid-form-2" style={{ gap: 14 }}>
                      <div style={{ gridColumn: "span 2" }}>
                        <Label className="field-label">Organization Name</Label>
                        <Input className="field-input mt-1.5" defaultValue="Oracle Petroleum" />
                      </div>
                      <div>
                        <Label className="field-label">Timezone</Label>
                        <select className="field-input mt-1.5" style={{ width: "100%", height: 38, padding: "0 10px", borderRadius: 8, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", color: "#fff", fontSize: 13 }}>
                          <option value="Asia/Manila">Asia/Manila (PHT, UTC+8)</option>
                          <option value="UTC">UTC</option>
                          <option value="America/New_York">America/New_York (EST)</option>
                        </select>
                      </div>
                      <div>
                        <Label className="field-label">Date Format</Label>
                        <select className="field-input mt-1.5" style={{ width: "100%", height: 38, padding: "0 10px", borderRadius: 8, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", color: "#fff", fontSize: 13 }}>
                          <option>MMM DD, YYYY</option>
                          <option>DD/MM/YYYY</option>
                          <option>YYYY-MM-DD</option>
                        </select>
                      </div>
                      <div style={{ gridColumn: "span 2" }}>
                        <Label className="field-label">Asset ID Prefix</Label>
                        <Input className="field-input mt-1.5" defaultValue="ORC-" placeholder="e.g. ORC-" />
                        <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 5 }}>Prefix applied to all new asset serial numbers.</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <Button variant="ghost" className="rounded-full h-[34px] px-4 text-xs font-bold border border-white/7 text-muted-foreground hover:text-white">Cancel</Button>
                  <Button variant="lime" className="rounded-full h-[34px] px-4 text-xs font-bold" onClick={handleSave}>Save changes</Button>
                </div>
              </>
            )}

            {/* Integrations */}
            {activeTab === "Integrations" && (
              <Card>
                <CardContent style={{ padding: 22 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 4 }}>Integrations</div>
                  <div style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 20 }}>Connect Oracle Inventory to external tools.</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {[
                      { name: "Slack", desc: "Send alerts to a Slack channel", connected: false, icon: "💬" },
                      { name: "Google Sheets", desc: "Sync asset data to a spreadsheet", connected: false, icon: "📊" },
                      { name: "Webhook", desc: "Push events to a custom endpoint", connected: false, icon: "🔗" },
                    ].map((int) => (
                      <div key={int.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "rgba(255,255,255,.03)", borderRadius: 10, border: "1px solid rgba(255,255,255,.07)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{ fontSize: 22 }}>{int.icon}</span>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{int.name}</div>
                            <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>{int.desc}</div>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" className="rounded-full h-8 px-4 text-xs font-bold border border-white/7 text-muted-foreground hover:text-white flex-shrink-0">
                          Connect
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Security */}
            {activeTab === "Security" && (
              <>
                <Card>
                  <CardContent style={{ padding: 22 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 18 }}>Change Password</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      <div>
                        <Label className="field-label">Current Password</Label>
                        <Input className="field-input mt-1.5" type="password" placeholder="••••••••" />
                      </div>
                      <div>
                        <Label className="field-label">New Password</Label>
                        <Input className="field-input mt-1.5" type="password" placeholder="••••••••" />
                      </div>
                      <div>
                        <Label className="field-label">Confirm New Password</Label>
                        <Input className="field-input mt-1.5" type="password" placeholder="••••••••" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent style={{ padding: 22 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 4 }}>Session</div>
                    <div style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 16 }}>You are currently signed in. Sessions expire after 8 hours.</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {[
                        { device: "Chrome · Windows", location: "Manila, PH", current: true },
                        { device: "Safari · iPhone", location: "Manila, PH", current: false },
                      ].map((s) => (
                        <div key={s.device} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "rgba(255,255,255,.03)", borderRadius: 10, border: "1px solid rgba(255,255,255,.07)" }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{s.device} {s.current && <span style={{ fontSize: 10, color: "var(--lime)", fontWeight: 700, marginLeft: 6, background: "rgba(198,255,0,.12)", padding: "2px 6px", borderRadius: 4 }}>Current</span>}</div>
                            <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>{s.location}</div>
                          </div>
                          {!s.current && (
                            <Button variant="ghost" size="sm" className="rounded-full h-7 px-3 text-xs font-bold border border-white/7 text-muted-foreground hover:text-white">
                              Revoke
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <Button variant="ghost" className="rounded-full h-[34px] px-4 text-xs font-bold border border-white/7 text-muted-foreground hover:text-white">Cancel</Button>
                  <Button variant="lime" className="rounded-full h-[34px] px-4 text-xs font-bold" onClick={handleSave}>Update Password</Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
