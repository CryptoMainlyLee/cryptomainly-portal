import {
  MARKET_OBSERVATIONS,
  RESEARCH_EDITION_DATE,
  type MarketObservation,
} from "./observations";

/**
 * Editions are immutable snapshots, newest first. A new editorial release
 * adds a NEW edition record and its own data, preserving old URLs/content.
 * Nothing here schedules source scans or auto-publishes X content.
 */
export type ResearchEdition = {
  slug: string;
  displayDate: string;
  summary: string;
  observations: MarketObservation[];
  highlights: string[];
};

export const RESEARCH_EDITIONS: ResearchEdition[] = [
  {
    slug: "2026-11-15",
    displayDate: RESEARCH_EDITION_DATE,
    summary: "Bitcoin structure, US technology positioning and equity-fund flows.",
    observations: MARKET_OBSERVATIONS,
    highlights: ["Bitcoin", "S&P 500", "Technology", "Fund flows"],
  },
];

export const LATEST_RESEARCH_EDITION = RESEARCH_EDITIONS[0];

export function researchEditionBySlug(slug: string): ResearchEdition | undefined {
  return RESEARCH_EDITIONS.find((edition) => edition.slug === slug);
}
