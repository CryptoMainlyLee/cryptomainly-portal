import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MarketIntelligenceDashboard from "./MarketIntelligenceDashboard";
import { publicEditions } from "../../_mi/public-editions";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Market Intelligence | CryptoMainly",
  description:
    "Curated crypto, stock and macro research linked to original analysts. Historical opinions are not independently validated trade signals.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/vip/market-intelligence" },
};

export default async function MarketIntelligencePage() {
  const edition = (await publicEditions())[0];
  if (!edition) notFound();
  return <MarketIntelligenceDashboard edition={edition} />;
}
