# CryptoMainly Market Intelligence V1.4 — Technical Handoff
**Prepared:** Sunday 15 November 2026 (UK)
**Branch:** feature/vip-market-intelligence-v14-2026-11-15
**Baseline:** main / d8cbf70 (unchanged until approved integration)
**Proposed public URL:** https://www.cryptomainly.co.uk/vip/market-intelligence

## Objective
An on-brand, low-maintenance, low-cash-cost market research index on the existing CryptoMainly website, with optional access to original analyst charts via X's official embed mechanism. Starting edition is public, dated, and manually curated. Later a member entitlement model may offer free introductory observations, a lower-priced research tier, and a premium VIP tier.

## Implementation
- The static Next.js 14 route is app/vip/market-intelligence/page.tsx.
- Interactive public page: MarketIntelligenceDashboard.tsx and market-intelligence.css.
- Curated records: observations.ts (7 real X posts reviewed on 15 Nov 2026).
- Designed to match the homepage: navy gradient (#0a1824 → #05131e → #020a14), gold accents (#fbbf24), actual CryptoMainly coin-gold.png brand asset, translucent rounded panels.
- Browser filters: Crypto, Stocks, Macro; text search; mobile responsive.
- All text and attribution shown in-house. No third-party chart images are copied to the public repository.
- Every card includes an owned, generic, decorative chart visual, explicitly marked NOT ACTUAL PRICE DATA. A visitor can click "Load source chart" to invoke the official X post embed containing the author's chart when allowed by X and their browser.
- An explicit, site-wide "Load all original X charts" action also exists. No X scripts load by default; third-party content is requested only after visitor interaction.
- If the embed fails or is blocked, the original X source link always remains.
- Query parameter ?share=1 creates a compact, four-card, screenshot-friendly research overview with no third-party embeds, suitable for capturing as an owned CryptoMainly-branded promotional image.
- No X API tokens, OpenAI API integration, keys, cookies, external databases, payments, or Telegram publishing are included.

## Editorial and financial-promotion safeguards
- Source posts are attributed and link to the originals.
- Source images are only presented by X widgets when requested, subject to X's rules and browser behaviour.
- The original decorative graphics are intentionally non-market-data illustrations.
- Any chart can be stale, speculative or factually incorrect; the source record explicitly displays its publication date and major limitations.
- The edition states that there are zero independently verified trade signals.
- Descriptions avoid buy/sell directives, entry instructions, leverage promotions or guaranteed outcomes.
- The UK FCA's 12 November 2026 creator guidance should be checked before any public financial promotions or future trade recommendations. Educational labelling alone does not guarantee exemption.
- Any future automatic posting and paid access changes need separate legal, compliance and rights reviews.

## Manual update workflow
1. Read and verify new source X posts with the dedicated external scanner. Keep API spending limits.
2. Editor selects only sufficiently useful posts; no automatically published candidates.
3. Update the objects in observations.ts, including real source URL, original publish date, explanation and limitations.
4. Update RESEARCH_EDITION_DATE. Retire stale observations from the active page.
5. Run npm ci (if needed), npm run build, verify mobile/desktop layout and source links.
6. Generate the Telegram summary image by visiting /vip/market-intelligence?share=1 and capturing a screenshot.
7. Review legal and copyright compliance before any publication or VIP Telegram sharing.
8. Merge and deploy only after checking latest production state, build, rollback and the existing safeguarding architecture.

## Future monetisation path (idea, NOT built)
- Stage 1 (current): public entry point with a weekly curated edition, no login.
- Stage 2: optional visitor registration / saved research preferences only if there is a genuine need.
- Stage 3: a lower-cost Research membership could unlock more frequent observations, historical archive, saved lists and richer context.
- Stage 4: full VIP tier could integrate enhanced analysis and existing indicators/bots, but trading automation remains a separate system.
- Before paywall: use server-side entitlement enforcement with the existing Supabase membership infrastructure; **do not trust hidden links or client-only checks**.
- Preserve Phase 3A safeguarding: no Telegram membership writes, real identity links, or automatic granting/removal of member access.
- Do not add paid subscriptions, new hosted projects or credentials without explicit approval.

## Quality checks
- npm run build passed on an isolated worktree; Next generated the route statically.
- Playwright/Puppeteer-equivalent Chrome tests passed on a 390px mobile viewport and 1366px desktop.
- Seven observations / seven original source links.
- Filters: Crypto 3, Stocks 2, Macro 2, Brandt search 2.
- X embed is absent before consent, appears after click (verified with stubbed X widget loader to avoid third-party network calls in the test).
- ?share=1 yields four curated cards, no embeds, for a Telegram-style screenshot.
- Screenshots stored outside the source repository in CryptoMainly-Trade-Setup-Scanner\vip-dashboard-v14.

## Hosting caveat
The existing CryptoMainly site's hosting plan should be verified; Vercel's Hobby free plan is not meant for commercial projects. A static route has negligible marginal infrastructure usage but this is not a guarantee of free commercial hosting.

## Privacy
External X widgets may perform tracking and set cookies; loading them only after a user click avoids unsolicited automatic activation, but the privacy notice should explain third-party embeds before broad publication.

## References
- X Embed Help: https://help.x.com/en/using-x/how-to-embed-a-post
- ICO consent and third-party embedded content: https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/how-do-we-manage-consent-in-practice/
- FCA financial promotions creators: https://www.fca.org.uk/firms/financial-promotions-adverts/what-content-creators-need-know-posting
- Vercel pricing: https://vercel.com/pricing
