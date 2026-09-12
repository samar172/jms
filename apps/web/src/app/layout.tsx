import type { Metadata, Viewport } from "next";
import { Noto_Sans_Devanagari } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

// Latin/UI text uses Arial — a system face (nothing to download, heavier and
// clearer than Inter). Only Devanagari is fetched, self-hosted via next/font,
// and it sits in the font stack as the fallback that renders Hindi glyphs.
const devanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-dev",
});

export const metadata: Metadata = {
  title: "JMS — Jewellery Manufacturing & Costing",
  description: "Jewellery Manufacturing, Costing & Karigar Management System",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "JMS" },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#1e3a8a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${devanagari.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-bg text-text">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
