# NHIH Command Desk mobile PWA

Review branch only: adds a separate mobile install identity for the existing /desk route, without a separate database or public endpoint.

Once reviewed and deployed, open the HTTPS /desk URL on the authorized phone, then select Install app or Add to Home Screen. The operator login and live API are reused.

Security: service worker has no caching; operation requires internet access. Existing API publicly permits read access and unrestricted CORS; review authentication, rate limits and privacy before expanding access. Do not merge until mobile regression testing is complete.

Fix: service worker is now served from `/desk/sw.js`, so its scope `/desk` is allowed by browsers. Before merging, confirm `/desk-manifest.webmanifest`, `/desk-icon.svg`, and `/desk/sw.js` respond successfully after building and deploying. Android Chrome installability must be verified on-device; the SVG icon may need PNG fallback on some devices.
