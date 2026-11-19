export type MarketCategory = "crypto" | "stocks" | "macro";

export type MarketObservation = {
  id: string;
  category: MarketCategory;
  categoryLabel: string;
  symbol: string;
  title: string;
  type: string;
  source: string;
  authorHandle: string;
  publishedDate: string;
  summary: string;
  whyInteresting: string;
  limitations: string;
  url: string;
  // Optional only for immutable legacy editions; mandatory on newly staged content.
  created_at_utc?: string;
  asset?: string;
  timeframe?: string;
  pattern_or_anomaly?: string;
  confirmation?: string;
  invalidation?: string;
  thesis_key?: string;
  editorial_score?: number;
};

// Editorial excerpts from the 15 November 2026 research pilot.
// All items are UNVERIFIED historical discussions, not trade signals.
// No third-party X screenshots, direct media URLs, API credentials or paid services are stored.
export const RESEARCH_EDITION_DATE = "15 November 2026";
export const MARKET_OBSERVATIONS: MarketObservation[] = [
  {
    id: "2121688198112067943",
    category: "crypto",
    categoryLabel: "Crypto structure",
    symbol: "BTC / USD",
    title: "Bitcoin's failed $75.5k retest",
    type: "3-day chart",
    source: "Rekt Capital",
    authorHandle: "rektcapital",
    publishedDate: "14 Nov 2026",
    summary: "An annotated BTC chart highlights a rejected attempt to reclaim former support near $75,500 and discusses the broader trading range.",
    whyInteresting: "The retest gives a concrete level to investigate rather than an unspecific price prediction.",
    limitations: "The interpretation needs independent price validation and a defined invalidation before it could become a trade plan.",
    url: "https://x.com/rektcapital/status/2121688198112067943",
  },
  {
    id: "2121674564476309524",
    category: "crypto",
    categoryLabel: "Long-term trend",
    symbol: "BTC / USD",
    title: "200-week moving-average test",
    type: "Weekly chart",
    source: "Rekt Capital",
    authorHandle: "rektcapital",
    publishedDate: "14 Nov 2026",
    summary: "A weekly Bitcoin chart compares the current deviation around the 200-week moving average with an earlier deviation in the cycle.",
    whyInteresting: "It offers a potential long-term market-regime reference to monitor.",
    limitations: "Historical reversals do not establish a new reversal or a profitable entry.",
    url: "https://x.com/rektcapital/status/2121674564476309524",
  },
  {
    id: "2121273580466131052",
    category: "stocks",
    categoryLabel: "Stock indices",
    symbol: "S&P 500 / MES",
    title: "Possible early reversal formation",
    type: "Daily futures chart",
    source: "Peter Brandt",
    authorHandle: "PeterLBrandt",
    publishedDate: "13 Nov 2026",
    summary: "A daily micro S&P 500 futures chart shows a potential head-and-shoulders top in an evolving range.",
    whyInteresting: "The price structure is clearly annotated and worth watching for genuine confirmation.",
    limitations: "A developing pattern is not a confirmed breakdown and the post does not specify a complete risk plan.",
    url: "https://x.com/PeterLBrandt/status/2121273580466131052",
  },
  {
    id: "2121251695426449746",
    category: "stocks",
    categoryLabel: "Sector positioning",
    symbol: "US TECHNOLOGY / S&P 500",
    title: "Technology's relative drawdown",
    type: "Historical comparison",
    source: "Mark Minervini",
    authorHandle: "markminervini",
    publishedDate: "13 Nov 2026",
    summary: "A multi-period chart compares past periods of pronounced technology-sector underperformance against the wider market.",
    whyInteresting: "The variation in subsequent historical outcomes challenges assumptions that oversold markets must immediately rebound.",
    limitations: "The sample and chart methodology have not been independently validated.",
    url: "https://x.com/markminervini/status/2121251695426449746",
  },
  {
    id: "2121924373942804666",
    category: "macro",
    categoryLabel: "Global capital flows",
    symbol: "US EQUITIES / TREASURIES",
    title: "Foreign investor allocation shift",
    type: "Macro research",
    source: "Barchart",
    authorHandle: "Barchart",
    publishedDate: "15 Nov 2026",
    summary: "A source-labelled graphic compares reported foreign flows into US equities and Treasury markets.",
    whyInteresting: "Positioning changes can add context to broad market moves.",
    limitations: "The data source and measurement period still require independent verification.",
    url: "https://x.com/Barchart/status/2121924373942804666",
  },
  {
    id: "2121900567664500901",
    category: "macro",
    categoryLabel: "Fund flows",
    symbol: "GLOBAL EQUITIES",
    title: "Unusually large equity inflows",
    type: "Macro research",
    source: "Barchart",
    authorHandle: "Barchart",
    publishedDate: "15 Nov 2026",
    summary: "A circulated chart describes approximately $98.3bn of weekly global equity-fund inflows.",
    whyInteresting: "The magnitude may be relevant to understanding sentiment and positioning.",
    limitations: "The figure, timing, and underlying methodology have not been independently checked.",
    url: "https://x.com/Barchart/status/2121900567664500901",
  },
  {
    id: "2121786054873337951",
    category: "crypto",
    categoryLabel: "Crypto structure",
    symbol: "BTC / USD",
    title: "Long-term head-and-shoulders thesis",
    type: "Weekly hypothesis",
    source: "Peter Brandt",
    authorHandle: "PeterLBrandt",
    publishedDate: "15 Nov 2026",
    summary: "A speculative bearish Bitcoin formation prompts a discussion about the limitations of chart-based forecasts.",
    whyInteresting: "It is a useful example of how a recognisable chart pattern can be over-interpreted.",
    limitations: "An associated measured-move projection extends below a feasible Bitcoin spot price. This is not an executable signal.",
    url: "https://x.com/PeterLBrandt/status/2121786054873337951",
  },
];
