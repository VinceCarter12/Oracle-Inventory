---
date: 2026-07-30
tags: [decision]
---

# ADR: Suspend User-Facing Scan Rollout
Date: 2026-07-30
Status: Accepted

## Decision

Suspend and freeze all user-facing QR/OCR Scan System work and rollout until a later owner decision explicitly reopens it.

The freeze covers `/assets/scan`, `/scan/mobile`, and `/scan/review`. Existing code and scaffolds must not be deleted as part of this decision.

Belarc Hardware Audit remains active and is not part of this suspension. The supported Belarc path remains manual Belarc HTML upload, parsing, baseline comparison, and admin review. Do not describe the current Belarc workflow as a Belarc API integration.

## Why

The next planning batch should focus on Belarc acquisition/discovery decisions and the workbook-driven data dictionary for device, network, and CCTV scope before exposing or expanding Scan System workflows to users.

Automated Belarc discovery is not approved yet. A commercial BelManage export, API, connector, license, and contract must be confirmed before planning or claiming automated discovery.

## Consequences

- User-facing Scan System rollout stays blocked pending owner approval.
- Scan code/scaffolding remains in place for possible future use.
- Current planning focus moves to Belarc acquisition/discovery due diligence and the workbook/network/CCTV data dictionary.
- Hardware Audit continues as an active manual HTML-upload workflow.

## Related

[[Context]] | [[Planning/PLAN]] | [[Planning/Pages/ScanSystem]] | [[Planning/Pages/HardwareAudit]] | [[Planning/Inventory-System-Blueprint]]
