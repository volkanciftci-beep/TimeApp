---
name: Managed employee passwords
description: Clerk password-policy constraint for owner-provisioned ZeitApp employee accounts.
---

Keep Clerk as the only password store for managed employee accounts; do not add password hashes to PostgreSQL. Generated temporary passwords must be at least 15 characters.

**Why:** The user confirmed Clerk should remain the authentication system. A duplicate database hash would not be used by Clerk sign-in and would increase risk. Clerk also rejected the previous 14-character password with `form_password_length_too_short`.

**How to apply:** Generate one password per provisioned member, pass it directly to Clerk, and return it only in the successful creation response for one-time admin display. Keep it out of database rows and logs.