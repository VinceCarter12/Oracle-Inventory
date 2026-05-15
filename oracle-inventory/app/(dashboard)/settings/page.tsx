"use client";

import TopBar from "@/components/TopBar";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { apiFetch } from "@/lib/auth";

const TABS = ["Profile", "Workspace", "Notifications", "Integrations", "Security", "Danger zone"];

const TOGGLES = [
  { label: "Asset returned", sub: "Notify when items are returned", on: true },
  { label: "Repair threshold", sub: "Alert when repair queue exceeds 30", on: true },
  { label: "Weekly digest", sub: "Summary every Monday", on: false },
  { label: "Disposal approvals", sub: "Require approval before retirement", on: true },
];

interface Category { id: string; name: string; _count: { assets: number } }

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("Profile");
  const [switches, setSwitches] = useState(TOGGLES.map(t => t.on));

  // Profile state
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);

  // Security state
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  // Categories state
  const [categories, setCategories] = useState<Category[]>([]);
  const [catLoading, setCatLoading] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [addingCat, setAddingCat] = useState(false);

  useEffect(() => {
    apiFetch("/api/users/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) { setProfileName(data.name); setProfileEmail(data.email); }
      });
  }, []);

  const loadCategories = useCallback(() => {
    setCatLoading(true);
    apiFetch("/api/categories")
      .then((r) => r.json())
      .then(setCategories)
      .finally(() => setCatLoading(false));
  }, []);

  useEffect(() => {
    if (activeTab === "Workspace") loadCategories();
  }, [activeTab, loadCategories]);

  async function handleProfileSave() {
    setProfileSaving(true);
    try {
      const r = await apiFetch("/api/users/me", {
        method: "PUT",
        body: JSON.stringify({ name: profileName, email: profileEmail }),
      });
      if (!r.ok) {
        const err = await r.json();
        toast.error(err.error ?? "Failed to save profile.");
        return;
      }
      toast.success("Profile saved.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function handlePasswordSave() {
    if (newPw !== confirmPw) { toast.error("New passwords do not match."); return; }
    if (newPw.length < 6) { toast.error("New password must be at least 6 characters."); return; }
    setPwSaving(true);
    try {
      const r = await apiFetch("/api/users/me/password", {
        method: "PUT",
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      if (!r.ok) {
        const err = await r.json();
        toast.error(err.error ?? "Failed to update password.");
        return;
      }
      toast.success("Password updated.");
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    } finally {
      setPwSaving(false);
    }
  }

  async function handleAddCategory() {
    if (!newCatName.trim()) return;
    setAddingCat(true);
    try {
      const r = await apiFetch("/api/categories", {
        method: "POST",
        body: JSON.stringify({ name: newCatName.trim() }),
      });
      if (!r.ok) {
        const err = await r.json();
        toast.error(err.error ?? "Failed to add category.");
        return;
      }
      const cat = await r.json();
      setCategories((prev) => [...prev, cat].sort((a, b) => a.name.localeCompare(b.name)));
      setNewCatName("");
    } finally {
      setAddingCat(false);
    }
  }

  async function handleDeleteCategory(id: string) {
    const r = await apiFetch(`/api/categories/${id}`, { method: "DELETE" });
    if (!r.ok) {
      const err = await r.json();
      toast.error(err.error ?? "Failed to delete category.");
      return;
    }
    setCategories((prev) => prev.filter((c) => c.id !== id));
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
                          {profileName.split(" ").map(w => w[0]).slice(0, 2).join("") || "SJ"}
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
                        <Input id="settings-name" className="field-input mt-1.5" value={profileName} onChange={(e) => setProfileName(e.target.value)} />
                      </div>
                      <div>
                        <Label htmlFor="settings-role" className="field-label">Role</Label>
                        <Input id="settings-role" className="field-input mt-1.5" defaultValue="Inventory Admin" />
                      </div>
                      <div style={{ gridColumn: "span 2" }}>
                        <Label htmlFor="settings-email" className="field-label">Email</Label>
                        <Input id="settings-email" className="field-input mt-1.5" value={profileEmail} onChange={(e) => setProfileEmail(e.target.value)} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <Button variant="ghost" className="rounded-full h-[34px] px-4 text-xs font-bold border border-white/7 text-muted-foreground hover:text-white">
                    Cancel
                  </Button>
                  <Button variant="lime" className="rounded-full h-[34px] px-4 text-xs font-bold" onClick={handleProfileSave} disabled={profileSaving}>
                    {profileSaving ? "Saving…" : "Save changes"}
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
                  <Button variant="lime" className="rounded-full h-[34px] px-4 text-xs font-bold" onClick={() => toast.success("Settings saved successfully.")}>
                    Save changes
                  </Button>
                </div>
              </>
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

                {/* Asset Categories manager */}
                <Card>
                  <CardContent style={{ padding: 22 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 16 }}>Asset Categories</div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                      <Input
                        className="field-input"
                        placeholder="New category name…"
                        value={newCatName}
                        onChange={(e) => setNewCatName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleAddCategory(); }}
                        style={{ flex: 1 }}
                      />
                      <Button
                        variant="lime"
                        size="sm"
                        className="rounded-full h-9 px-4 text-xs font-bold flex-shrink-0"
                        onClick={handleAddCategory}
                        disabled={addingCat || !newCatName.trim()}
                      >
                        Add
                      </Button>
                    </div>
                    {catLoading ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {[0, 1, 2].map((i) => (
                          <div key={i} style={{ height: 36, background: "rgba(255,255,255,.04)", borderRadius: 8 }} />
                        ))}
                      </div>
                    ) : categories.length === 0 ? (
                      <div style={{ fontSize: 13, color: "var(--muted-foreground)", textAlign: "center", padding: "16px 0" }}>
                        No categories yet.
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {categories.map((cat) => (
                          <div key={cat.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "rgba(255,255,255,.04)", borderRadius: 8 }}>
                            <div>
                              <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{cat.name}</span>
                              <span style={{ fontSize: 11, color: "var(--muted-foreground)", marginLeft: 8 }}>
                                {cat._count.assets} asset{cat._count.assets !== 1 ? "s" : ""}
                              </span>
                            </div>
                            {cat._count.assets === 0 && (
                              <button
                                onClick={() => handleDeleteCategory(cat.id)}
                                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--coral)", fontSize: 11, fontWeight: 600, padding: "2px 6px" }}
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <Button variant="ghost" className="rounded-full h-[34px] px-4 text-xs font-bold border border-white/7 text-muted-foreground hover:text-white">Cancel</Button>
                  <Button variant="lime" className="rounded-full h-[34px] px-4 text-xs font-bold" onClick={() => toast.success("Settings saved successfully.")}>Save changes</Button>
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
                      { name: "Slack", desc: "Send alerts to a Slack channel", icon: "💬" },
                      { name: "Google Sheets", desc: "Sync asset data to a spreadsheet", icon: "📊" },
                      { name: "Webhook", desc: "Push events to a custom endpoint", icon: "🔗" },
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
                        <Input className="field-input mt-1.5" type="password" placeholder="••••••••" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
                      </div>
                      <div>
                        <Label className="field-label">New Password</Label>
                        <Input className="field-input mt-1.5" type="password" placeholder="••••••••" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
                      </div>
                      <div>
                        <Label className="field-label">Confirm New Password</Label>
                        <Input className="field-input mt-1.5" type="password" placeholder="••••••••" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
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
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>
                              {s.device}
                              {s.current && <span style={{ fontSize: 10, color: "var(--lime)", fontWeight: 700, marginLeft: 6, background: "rgba(198,255,0,.12)", padding: "2px 6px", borderRadius: 4 }}>Current</span>}
                            </div>
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
                  <Button variant="lime" className="rounded-full h-[34px] px-4 text-xs font-bold" onClick={handlePasswordSave} disabled={pwSaving}>
                    {pwSaving ? "Updating…" : "Update Password"}
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

          </div>
        </div>
      </div>
    </div>
  );
}
