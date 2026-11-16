import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MarketIntelligenceDashboard from "./MarketIntelligenceDashboard";
import { LATEST_RESEARCH_EDITION } from "./editions";

export const metadata: Metadata = {
  title: "Market Intelligence | CryptoMainly",
  description:
    "Curated crypto, stock and macro research linked to original analysts. Historical opinions are not independently validated trade signals.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/vip/market-intelligence" },
};

export default function MarketIntelligencePage() {
  if (!LATEST_RESEARCH_EDITION) notFound();
  return <MarketIntelligenceDashboard edition={LATEST_RESEARCH_EDITION} />;
}
