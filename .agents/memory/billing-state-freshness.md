---
name: Billing state freshness
description: Rules that prevent stale PWA or Stripe mirror data from selecting the wrong billing action.
---

The ZeitApp service worker must bypass all `/api/` requests, and changing this behavior must bump its cache name so installed Safari PWAs delete stale API responses.

**Why:** Cache-first handling stored `/api/timeapp/me`, leaving Safari on an old inactive company state and causing the billing CTA to select Checkout instead of Customer Portal.

**How to apply:** Cache only the app shell and static assets. Verify subscription-state changes with a fresh network response in an installed/mobile PWA.

Request-time Stripe mirror reconciliation may discover `active` or `trialing` subscriptions, but a missing or stale non-active mirror row must not overwrite a Company status already confirmed by a verified Stripe webhook.

**Why:** Stripe webhook delivery updated the Company immediately, while the synchronized Stripe table lagged and briefly forced the tenant back to inactive.

**How to apply:** Treat verified subscription webhooks as authoritative for status transitions; use the mirror only for positive active/trialing discovery.