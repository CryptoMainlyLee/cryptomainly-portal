# Market Intelligence Telegram media

## First dated image

- Edition: 15 November 2026
- Immutable public image path: `/assets/market-intelligence/2026-11-15-telegram.png`
- Source page: `https://www.cryptomainly.co.uk/vip/market-intelligence?share=1` (HTML)
- Image is a real browser-rendered capture, not fabricated or verified chart data.
- It illustrates 4 discussions and retains the historical / not-live-signals disclaimer.
- The picture is only a preview; Telegram caption should contain the current or dated dashboard URL.
- Public access does not imply that VIP posting is activated.

## Repeatable editorial process

1. Approve and publish a separate immutable dated research edition.
2. Capture that edition's share view using the known Puppeteer renderer, with verified research date, at ~1100 px width and 1x scale.
3. Save the resulting PNG as `public/assets/market-intelligence/YYYY-MM-DD-telegram.png` with the actual edition slug. Never overwrite an older image.
4. Deploy and verify the URL returns HTTP 200, `image/png` and valid PNG bytes. Don't send the HTML `?share=1` page to Telegram as an image.
5. Trigger Make only after human editorial approval, with `approved: true`, matching dated `edition_url`, `image_url`, and destination `TEST_ONLY` during tests.
6. For live VIP announcements, require authenticated webhook requests, validate the edition, block duplicates, send to the authorized Telegram chat, and then write the sent-key record after Telegram acknowledges success.
7. Never scrape, regenerate, or republish third-party original charts into this preview unless rights are established. The decorative charts on this capture are clearly labelled illustrations.

The capture source and QA scripts are in the user's local `Documents/ CryptoMainly-Trade-Setup-Scanner/make-local-browser-v1/` folder, not hosted. This static image requires no paid screenshot API, no runtime Vercel browser, and no Make polling.
