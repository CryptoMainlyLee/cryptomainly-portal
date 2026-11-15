# CryptoMainly Market Intelligence V1.5 — Clearer Chart Opens and Edition Archive

Prepared 15 November 2026. Scoped to CryptoMainly’s Market Intelligence routes. Does not touch homepage, VIP member data, Supabase, Telegram access, or existing news pipeline.

## Publication model (proposed)
- Canonical Latest URL stays unchanged: /vip/market-intelligence
- Browse editions: /vip/market-intelligence/archive
- Permanent dated edition: /vip/market-intelligence/archive/2026-11-15
- A new edition, after editorial approval, becomes Latest; the archive index lists all editions newest-first. Older dated URLs retain the source content and original publish dates.
- Public and no paywall for now.
- The 15 November pilot is the sole actual published edition; no earlier or future entries fabricated.

## Cadence
- Mon/Wed/Fri is a suggested editorial target, not automated or guaranteed.
- Skip periods with no meaningful, sourced, non-duplicate research.
- The X scanner is not running unattended. No paid AI image analysis or added X subscription is authorized here.
- Initially curate saved free/manual source links and previously collected posts; any API expansion requires budget approval.
- After human editorial review, one Make.com Telegram image and the Latest URL may be shared; never auto-post trade calls.

## Adding a new edition (manual workflow)
1. Verify candidates, source dates, chart URLs, authorship, conclusions, copyright and financial-promotion implications.
2. Create a NEW, dated data module for the edition. Preserve the original 15 November MARKET_OBSERVATIONS snapshot; never rewrite history.
3. Add the new edition to the FRONT of RESEARCH_EDITIONS in editions.ts with its ISO date, display label, true observation count and neutral summary.
4. Keep an immutable dated snapshot for each previously published edition.
5. Run Next build and browser tests: latest, archive index, each dated URL, mobile 390px, desktop, and ?share=1 view.
6. After review, deploy via the existing Vercel project with a restore checkpoint. Review the owned summary image before any Telegram distribution.
7. Show publication and source timestamps prominently. A dated research idea is not a live signal.
8. Three editions weekly could yield approximately 12–14 a month if there is sufficient worthwhile material.

## V1.5 UX improvement
- Entire illustrated chart preview is a keyboard-accessible button, with a prominent gold border, focus/hover treatment, and high-contrast call to action "VIEW ACTUAL CHART".
- Supporting text says tap/click anywhere to reveal the analyst's original post. Generic illustration is explicitly not price data.
- Share-image mode uses a static explanatory label, not a nonfunctional fake button.
- Official X embed loads only after visitor action. The direct original source remains as fallback.

## Tests
- Next build succeeded and generated all 3 page routes statically.
- Puppeteer browser tests passed: no overflow, seven clickable previews, embed opt-in, archive index with one real entry, dated page preserving seven source cards, and static Telegram image layout.
- All screenshots saved outside the repo under Documents\CryptoMainly-Trade-Setup-Scanner\vip-dashboard-v15.
- Production main stays at V1.4 fccfc72 until this improvement is explicitly rolled out.

## Later monetisation (not implemented)
- Potential tiers: free public preview, affordable Research membership, full VIP.
- Restrict actual content server-side using the existing approved membership model if monetisation is adopted. Do not rely on hidden client controls or unguessable URLs.
- No new paid services, keys or subscription plans added in V1.5.
