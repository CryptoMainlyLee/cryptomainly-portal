import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CryptoMainly Portal",
  description: "All-in-one hub for CryptoMainly: VIP, G-Bot, Indicator Lab, TradingView, and socials.",
  openGraph: {
    title: "CryptoMainly Portal",
    description: "All-in-one hub for CryptoMainly.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "CryptoMainly" }],
  },
  other: { "theme-color": "#0b0f14" }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
