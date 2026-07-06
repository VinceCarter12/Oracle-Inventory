---
date: 2026-06-29
tags: [planning, page-tracker]
---

# Scan System — Changes & Features

> Routes: `/assets/scan`, `/scan/mobile`, `/scan/review`
> Status: Backend done — mobile + review UI scaffolded, needs full wiring

---

## Bug Fixes / Changes

- [ ] [Medium] Wire `/scan/mobile` to scan room backend (connect device, send scan results)
- [ ] [Medium] Wire `/scan/review` admin queue to backend (fetch pending results, approve/reject)

---

## New Features

- [ ] [Hard] Multi-device scan room — support 1–5 mobile devices joining the same room via room code
- [ ] [Medium] Flashlight toggle on mobile scan page
- [ ] [Hard] 100+ bulk scan support — queue results, show running count, auto-submit batch
- [ ] [Hard] Admin review queue fully functional — show scan results, match to assets, approve or flag unknown
- [ ] [Medium] QR → phone handoff — desktop shows room code QR, mobile scans it to join
- [ ] [Easy] Room expiry countdown displayed on mobile scan page
- [ ] [Medium] Unknown scan alert — if scanned asset tag not found in DB, flag for admin review
