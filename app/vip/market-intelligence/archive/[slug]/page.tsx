import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MarketIntelligenceDashboard from "../../MarketIntelligenceDashboard";
import { RESEARCH_EDITIONS, researchEditionBySlug } from "../../editions";

type PageProps = { params: { slug: string } };

export function generateStaticParams() {
  return RESEARCH_EDITIONS.map((edition) => ({ slug: edition.slug }));
}

export function generateMetadata({ params }: PageProps): Metadata {
  const edition = researchEditionBySlug(params.slug);
  if (!edition) {
    return { title: "Edition not found | CryptoMainly", robots: { index: false } };
  }
  return {
    title: edition.displayDate + " Research Edition | CryptoMainly",
    description: "Archived CryptoMainly research from " + edition.displayDate + ", linked to original analyst sources.",
    robots: { index: false, follow: false },
  };
}

export default function ArchivedResearchEdition({ params }: PageProps) {
  const edition = researchEditionBySlug(params.slug);
  if (!edition) notFound();
  return <MarketIntelligenceDashboard edition={edition} isArchive />;
}
