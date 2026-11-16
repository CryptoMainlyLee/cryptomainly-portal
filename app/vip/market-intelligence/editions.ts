import {
  MARKET_OBSERVATIONS,
  RESEARCH_EDITION_DATE,
  type MarketObservation,
} from "./observations";
import visibility from "./visibility.json";

/**
 * Keep original editorial snapshots available to reviewers, but build ONLY
 * moderated content into the public website. Moderation is independent of
 * the underlying dated record and can be reversed after editorial review.
 *
 * IMPORTANT: do not import this module as a runtime value from a client
 * component. Public pages pass already-filtered editions from the server.
 */
export type ResearchEdition = {
  slug: string;
  displayDate: string;
  summary: string;
  observations: MarketObservation[];
  highlights: string[];
};

const ORIGINAL_EDITIONS: ResearchEdition[] = [
  {
    slug: "2026-11-15",
    displayDate: RESEARCH_EDITION_DATE,
    summary: "Bitcoin structure, US technology positioning and equity-fund flows.",
    observations: MARKET_OBSERVATIONS,
    highlights: ["Bitcoin", "S&P 500", "Technology", "Fund flows"],
  },
];

// Restricted admin review can inspect original snapshots. Never import this
// export into a client component or an unauthenticated route.
export const EDITORIAL_SOURCE_EDITIONS: ReadonlyArray<ResearchEdition> = ORIGINAL_EDITIONS;

// A whole-edition takedown removes its public route and archive entry.
// Individual takedowns remove those cards from both latest and archive views.
// An empty edition is also withheld rather than showing a misleading blank.
const hiddenEditions = new Set<string>(visibility.hidden_edition_slugs);
const hiddenPostsByEdition: Record<string, string[]> =
  visibility.hidden_post_ids_by_edition;

export const RESEARCH_EDITIONS: ResearchEdition[] = ORIGINAL_EDITIONS
  .filter((edition) => !hiddenEditions.has(edition.slug))
  .map((edition) => {
    const hiddenPosts = new Set(hiddenPostsByEdition[edition.slug] ?? []);
    return {
      ...edition,
      observations: edition.observations.filter((item) => !hiddenPosts.has(item.id)),
    };
  })
  .filter((edition) => edition.observations.length > 0);

export const LATEST_RESEARCH_EDITION: ResearchEdition | undefined =
  RESEARCH_EDITIONS[0];

export function researchEditionBySlug(slug: string): ResearchEdition | undefined {
  return RESEARCH_EDITIONS.find((edition) => edition.slug === slug);
}
