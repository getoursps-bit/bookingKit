import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Showcase and pre-launch builds stay out of search results. On top of this
// switch, the admin setting `site.noindex` adds a robots meta tag and closes
// robots.txt at runtime. The content security policy is set per request, with
// a nonce, in src/proxy.ts.
const noindex = process.env.SITE_NOINDEX !== "false";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(noindex ? [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] : []),
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The browser must always check for a new service worker.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
      { source: "/admin-sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
    ];
  },
};

// next-intl reads the language and strings of each request from this file.
export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
