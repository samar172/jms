import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @jms/shared exports its TypeScript source directly (no dist build), so let
  // Next compile it as part of the web build. This makes Vercel deploys work
  // without a separate step to build the shared workspace package.
  transpilePackages: ["@jms/shared"],
  // Bake in the production API URL so the app works on Vercel with no dashboard
  // config. `??` only fires on undefined/null, so local dev (where .env.local
  // sets NEXT_PUBLIC_API_URL="") still gets "" → relative paths → dev rewrites
  // below. A Vercel dashboard env var, if set, overrides this default.
  env: {
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL ?? "https://jms-api.98.70.37.83.nip.io",
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
      {
        // Uploaded images served by the API host, when rendered via next/image.
        protocol: "https",
        hostname: "jms-api.98.70.37.83.nip.io",
      },
    ],
  },
  // @ts-ignore
  allowedDevOrigins: ["noncapriciously-unelated-kalyn.ngrok-free.dev"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:4000/api/:path*",
      },
      {
        source: "/uploads/:path*",
        destination: "http://127.0.0.1:4000/uploads/:path*",
      },
    ];
  },
};

export default nextConfig;
