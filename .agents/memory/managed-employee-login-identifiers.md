---
name: Managed employee login identifiers
description: Tenant-specific Clerk behavior behind ZeitApp employee and manager credential login.
---

Keep the visible credential flow as company name/code + employee ID + password, but resolve the matching DB membership through its user ID and use that Clerk user's primary email as the internal password sign-in identifier.

**Why:** This Clerk tenant accepts usernames during backend user creation but does not enable username as a password sign-in identifier; sending the canonical username produces `Identifier is invalid`.

**How to apply:** Preserve tenant-scoped company/employee matching before resolving the Clerk user. Do not use synthetic email aliases because Clerk client-trust codes are sent to the identifier used for sign-in.