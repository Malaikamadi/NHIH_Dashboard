# NHIH Command — Cloudflare deployment (Ops Academy-style origin)

This deploys a dedicated Cloudflare Worker URL for the existing NHIH Command Desk. It does **not** publish a copy of operational records, move the database, or create a second backend. The Worker transparently proxies /desk, /api, the Vite assets, manifest, icons, and service worker to the existing HTTPS Tailscale Funnel.

## Deployment

From the repository root, using a computer with Node.js and Cloudflare account access:

```bash
cd cloudflare-command
npx wrangler login
npx wrangler deploy
```

Use the resulting https://nhih-command.<account-subdomain>.workers.dev/desk URL in Chrome on Samsung. Do not assume a URL until Wrangler reports it.

## Checks

```bash
BASE="https://nhih-command.<account-subdomain>.workers.dev"
for path in /desk /desk-manifest.webmanifest /desk-icon-192.png /desk-icon-512.png /desk-sw.js /api/state; do
  curl -L -sS -o /dev/null -w "$path %{http_code} %{content_type}\n" "$BASE$path"
done
```

Then verify the page links the manifest, that Chrome shows **Install**, and that the resulting app appears under Samsung Settings → Apps and launches without a browser address bar. An HTTP 200 or Chrome's Install prompt alone is not proof of Android installation.

## Security and operations

- Existing NHIH backend remains the sole data source. The Worker does not persist responses, credentials, or user data.
- The Worker makes the Command Desk available on another public hostname; **do not deploy without confirming that the existing authentication/authorization and Cloudflare access policy are suitable**. Tailscale Funnel is already public; this introduces another public route to the same service.
- Authentication cookies become host-specific to the new Cloudflare URL; users may need to sign in again.
- If NHIH server or Funnel is offline, the Cloudflare-hosted app will also be offline.
- Do not disable authorization, expose server SSH, or make a database publicly accessible.
- Keep existing NHIH service and GitHub auto-deploy unchanged.
- This is a Cloudflare Worker reverse proxy, not a static Cloudflare Pages copy. It retains same-origin /api calls without requiring changes to dashboard code.
