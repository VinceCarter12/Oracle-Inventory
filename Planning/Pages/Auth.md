---
date: 2026-06-29
tags: [planning, page-spec]
---

# Auth — Spec

> Routes: `/login`, `/forgot-password`, `/first-login`, `/otp-login` (pending)
> Status: JWT login complete — OTP login frontend pending
> Task status tracked in: [[Planning/Pages/_Overview#Auth]]

---

## OTP Login Flow (pending)

1. User visits `/login` → clicks "Login with OTP"
2. Enters email → receives OTP via email
3. Enters OTP on `/otp-login` → logs in
- OTP expires after 10 min, one-time use enforced
- Backend complete; frontend route `/otp-login` not built yet

## Session Rules

- JWT expiry → auto-redirect to `/login`
- First login → force password change on `/first-login` before proceeding

---

[[Home]] | [[Planning/Pages/_Overview]]
