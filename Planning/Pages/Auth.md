---
date: 2026-06-29
tags: [planning, page-tracker]
---

# Auth — Changes & Features

> Routes: `/login`, `/forgot-password`, `/first-login`, `/otp-login` (new)
> Status: Core JWT login done — OTP login frontend pending

---

## Bug Fixes / Changes

- [ ] [Easy] Confirm first-login redirect works correctly after password change

---

## New Features

- [ ] [Hard] OTP login route `/otp-login` — passwordless entry: enter email → receive OTP → login
- [ ] [Medium] OTP login as alternate entry point on `/login` page ("Login with OTP" link)
- [ ] [Medium] OTP login guards — OTP expires after 10 min, one-time use enforced
- [ ] [Easy] Show clear error messages for expired / already-used OTP codes
- [ ] [Medium] Session timeout handling — auto-redirect to login if JWT expires during session
