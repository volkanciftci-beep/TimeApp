---
name: Preview subscription bypass
description: Safety boundary for testing expired ZeitApp companies without weakening production billing.
---

Grant subscription-independent operational access only when the API process has `NODE_ENV` exactly equal to `development`; never accept a client flag, request header, query parameter, or persisted company setting for this bypass.

**Why:** Development companies can outlive their trial and must still support employee provisioning and login tests, while published billing enforcement must remain authoritative.

**How to apply:** Use the bypass only for operational/team access. Keep Stripe reconciliation, subscription status, Checkout/Portal decisions, and `hasActiveSubscription` unchanged, and test the production branch explicitly.