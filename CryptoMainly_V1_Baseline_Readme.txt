# 🪙 CryptoMainly Portal — V1 Baseline (Stable Build)
Date: 27 October 2025
Author: Lee Nicholls
Project: CryptoMainly Portal
Purpose: Official locked-in baseline for all production components (OLED design, live data, fixed CTA, and mobile optimization).

## 🔧 Included Files (V1 Baseline)
### 1️⃣ page.tsx
Description:
- The main page layout and structure for the CryptoMainly Portal.
- Features OLED-compatible styling, bright follow banner, 12 Quick Links, G-Bot and Indicator Lab cards, and fixed CTA bar (“Start FREE” + “Join VIP”).
- Contains live PriceWidget and MarketMetricsWidget imports, fixed positioning logic, and portal rendering.
- All content is fully mobile-optimized and visually balanced for both Chrome and Samsung browsers.
- Verified working as: CryptoMainly Portal — OLED Fixed CTA V1

### 2️⃣ MarketMetricsWidget.tsx
Description:
- Compact metrics card showing key live crypto market stats.
- Combines Binance live data (BTC/ETH Open Interest, Funding Rate, Long/Short Ratio) with CoinGecko and Alternative.me (Fear & Greed Index).
- Includes dynamic green/red color logic, up/down arrows, and emoji indicators.
- Data auto-refreshes every 30 seconds with proxy caching for reliability.
- Footer credit: “Data provided by Binance & Alternative.me” (CoinGecko-green styling).
- Fully mobile responsive and visually consistent with the PriceWidget.

### 3️⃣ PriceWidget.tsx
Description:
- Displays live cryptocurrency prices from CoinGecko, fetched via a local proxy API (/api/prices) for stability.
- Shows 10 major coins (BTC, ETH, XRP, BNB, SOL, DOGE, TRX, ADA, LINK, LTC).
- Colour-coded 24-hour % change with ▲▼ arrows and dynamic green/red text.
- Includes search input connected to CoinGecko’s website and CoinGecko footer credit.
- Auto-refresh interval: 45 seconds, sticky values to prevent data loss during API hiccups.
- Perfectly matched to the OLED dark theme with sharp contrast and compact layout.

## 🧠 Technical Notes
- All API routes (/api/metrics/* and /api/prices) include built-in:
  - Retry logic (up to 3 attempts)
  - 10-second timeout
  - Fallback to cached data to prevent “blank” states
  - Local in-memory TTL caching for performance
- Client widgets use sticky setters, meaning they never regress to null once populated.
- All data refreshes asynchronously without blocking UI.
- Tested successfully on:
  - Chrome (desktop & Android)
  - Samsung Internet Browser
  - Edge (Windows)
  - iPhone Safari (visual test pending)

## 📁 Folder Structure Example
CryptoMainly_Portal_V1_Baseline_2025-10-27/
│
├── components/
│   ├── page.tsx
│   ├── MarketMetricsWidget.tsx
│   └── PriceWidget.tsx
│
├── api/
│   ├── metrics/
│   │   ├── global/route.ts
│   │   ├── fng/route.ts
│   │   └── binance/route.ts
│   └── prices/route.ts
│
└── CryptoMainly_V1_Baseline_Readme.txt

## 🏷️ Version Tag / Reference
Tag: v1-baseline
Commit message (if using Git):
> CryptoMainly Portal — V1 Baseline (page + MarketMetrics + Price widgets)

## 🛠️ Next Planned Step
Step 2 — Email Capture Integration
Goal: Add a compact, on-brand email signup form (“Stay updated — Free weekly insights from CryptoMainly”).
Planned location: Beneath PriceWidget on desktop and mobile versions.
Backend: Simple webhook or local JSON store (can later integrate with Brevo/Mailchimp API).
