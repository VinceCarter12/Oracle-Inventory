---
date: 2026-06-29
tags: [planning, page-spec]
---

# Scan System — Spec

> Routes: `/assets/scan`, `/scan/mobile`, `/scan/review`
> Status: Suspended 2026-07-30 - user-facing QR/OCR rollout frozen pending owner decision; backend and UI scaffolds remain in place
> Task status tracked in: [[Planning/Pages/_Overview#Scan-System]]

---

## Scan Room Flow

> **Suspension note**: This flow remains a retained specification only. Do not continue user-facing rollout for `/assets/scan`, `/scan/mobile`, or `/scan/review` until an owner decision reopens the Scan System. Do not delete existing code/scaffolds as part of the freeze.

1. Admin opens desktop → generates a room code → room code displays as QR
2. Mobile device(s) scan the QR → join the scan room
3. Mobile scans asset QR/barcodes → results stream to the room
4. Admin review queue (`/scan/review`) receives results → approve or flag unknowns

## Constraints

- 1–5 mobile devices per room simultaneously
- 100+ bulk scan: results queued, running count shown, auto-submit batch
- Room expiry countdown displayed on mobile
- Flashlight toggle on mobile scan page
- Unknown asset tag (not in DB) → flagged for admin review

---

[[Home]] | [[Planning/Pages/_Overview]]
