import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
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
