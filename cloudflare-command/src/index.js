// Cloudflare Worker entry point for the NHIH Command Desk.
// Reverse-proxies the existing NHIH server so /desk and /api remain same-origin.
// Does not store credentials, cache responses, or replicate operational records.
const UPSTREAM = 'https://nhih-ops.tailecbac3.ts.net';

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    if (incoming.pathname === '/') {
      return Response.redirect(new URL('/desk', incoming.origin), 302);
    }

    const target = new URL(incoming.pathname + incoming.search, UPSTREAM);
    const headers = new Headers(request.headers);
    // Let fetch generate Host for the upstream domain.
    headers.delete('host');
    headers.delete('cf-connecting-ip');
    headers.delete('x-forwarded-host');
    const upstreamRequest = new Request(target, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'manual',
      duplex: 'half'
    });
    let response;
    try {
      response = await fetch(upstreamRequest, { redirect: 'manual' });
    } catch {
      return new Response('NHIH Command is temporarily unavailable. Check the NHIH server connection.', {
        status: 502,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
      });
    }

    const out = new Headers(response.headers);
    out.set('Cache-Control', 'no-store, private');
    out.delete('cdn-cache-control');
    out.delete('content-security-policy-report-only');
    const location = out.get('location');
    if (location) {
      try {
        const redirect = new URL(location, UPSTREAM);
        if (redirect.origin === UPSTREAM) {
          out.set('location', incoming.origin + redirect.pathname + redirect.search + redirect.hash);
        }
      } catch { /* keep original relative redirect */ }
    }
    // Keep cookie attributes, including Secure/HttpOnly/SameSite, unchanged.
    // Origin host-only cookies are set against the new Worker host by the browser.
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: out });
  }
};
