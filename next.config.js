// Baseline security headers, sent on every route.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Only this site and the sites that embed it may frame it.
  {
    key: "Content-Security-Policy",
    value:
      "frame-ancestors 'self' https://jakezohdi.dev https://studio-zohdi-llc.com https://www.studio-zohdi-llc.com",
  },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }]
  },
}

module.exports = nextConfig
