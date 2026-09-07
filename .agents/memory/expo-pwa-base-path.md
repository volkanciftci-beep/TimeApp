---
name: Expo PWA base path
description: Production routing constraint for serving the Expo web export below the ZeitApp artifact path.
---

For the current Expo Router version, keep an explicit route that resolves `/timeapp/` to the app's main screen when serving the production web export below the artifact path.

**Why:** Setting `EXPO_BASE_URL` during `expo export --platform web` corrected generated asset URLs but did not make Expo Router recognize the browser location `/timeapp/`; mobile Safari reached the unmatched-route screen.

**How to apply:** Preserve the explicit artifact-path route when changing the web export or server. Recheck both `/timeapp/` and its generated assets with a production build before removing it.