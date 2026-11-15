import type { Metadata } from "next";
import MarketIntelligenceDashboard from "./MarketIntelligenceDashboard";

export const metadata: Metadata = {
  title: "Market Intelligence | CryptoMainly",
  description:
    "Curated crypto, stock and macro research linked to original analysts. Historical opinions are not independently validated trade signals.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/vip/market-intelligence" },
};

export default function MarketIntelligencePage() {
  return <MarketIntelligenceDashboard />;
}
