import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MarketIntelligenceDashboard from "../../MarketIntelligenceDashboard";
import { publicEditions } from "../../../../_mi/public-editions";

type PageProps = { params: { slug: string } };
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const edition = (await publicEditions()).find(e=>e.slug===params.slug);
  if (!edition) return {title:"Edition not found | CryptoMainly",robots:{index:false}};
  return {title:edition.displayDate+" Research Edition | CryptoMainly",description:"Archived CryptoMainly research from "+edition.displayDate+", linked to original analyst sources.",robots:{index:false,follow:false}};
}

export default async function ArchivedResearchEdition({ params }:PageProps){
  const edition=(await publicEditions()).find(e=>e.slug===params.slug);
  if(!edition)notFound();
  return <MarketIntelligenceDashboard edition={edition} isArchive/>;
}
