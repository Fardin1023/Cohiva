import type { NextConfig } from "next";

const developmentOrigins = (process.env.COHIVA_DEV_ALLOWED_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=()",
  },
  ...(process.env.NODE_ENV === "production"
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  // Vercel uses its own Next.js build adapter. Next.js 16.3.x can fail when
  // adapter builds are combined with standalone output because the adapter may
  // omit next-server.js.nft.json while the standalone finalizer still expects it.
  // Keep standalone output for self-hosted/Docker builds, but let Vercel use
  // its native output mode.
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
  ...(developmentOrigins.length > 0
    ? { allowedDevOrigins: developmentOrigins }
    : {}),
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
