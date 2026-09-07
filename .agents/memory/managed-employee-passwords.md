---
name: Managed employee passwords
description: Clerk password-policy constraint for owner-provisioned ZeitApp employee accounts.
---

Generated temporary passwords for managed employee accounts must be at least 15 characters.

**Why:** Clerk rejected the previous 14-character generated password with `form_password_length_too_short`, causing Mitarbeiter hinzufügen to return HTTP 422.

**How to apply:** Keep generated temporary passwords comfortably above 15 characters whenever changing employee provisioning; verify creation through the real Clerk-backed endpoint.