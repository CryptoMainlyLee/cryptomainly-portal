'use client';

import React from 'react';

type Props = {
  /** Optional default link if nothing is saved yet */
  defaultLink?: string;
  /** LocalStorage key (change if you want multiple instances) */
  storageKey?: string;
  /** Size in pixels for the image width (auto height) */
  width?: number;
};

function tvSnapshotToImage(url: string): { image: string; href: string } | null {
  // Accepts: https://www.tradingview.com/x/SjjTTtGZ/  (or without trailing slash)
  const m = url.trim().match(/tradingview\.com\/x\/([A-Za-z0-9]+)\/?/i);
  if (!m) return null;
  const id = m[1];
  // TradingView snapshot image convention:
  // https://s3.tradingview.com/snapshots/<first letter lowercased>/<ID>.png
  const folder = id[0].toLowerCase();
  const image = `https://s3.tradingview.com/snapshots/${folder}/${id}.png`;
  return { image, href: `https://www.tradingview.com/x/${id}/` };
}

export default function TopChartPreview({
  defaultLink = '',
  storageKey = 'chartPreview.link',
  width = 360,
}: Props) {
  const [link, setLink] = React.useState('');
  const [saved, setSaved] = React.useState<string | null>(null);
  const [imgUrl, setImgUrl] = React.useState<string | null>(null);
  const [href, setHref] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [ts, setTs] = React.useState<number>(() => Date.now()); // cache buster for refresh

  // Load saved link on mount
  React.useEffect(() => {
    const fromStore = localStorage.getItem(storageKey);
    const initial = fromStore || defaultLink || '';
    setLink(initial);
    setSaved(fromStore);
  }, [defaultLink, storageKey]);

  // Derive image URL whenever link changes (live preview)
  React.useEffect(() => {
    if (!link) {
      setImgUrl(null);
      setHref(null);
      setError(null);
      return;
    }
    const parsed = tvSnapshotToImage(link);
    if (!parsed) {
      setImgUrl(null);
      setHref(null);
      setError('Paste a TradingView snapshot link like https://www.tradingview.com/x/XXXXXXXX/');
      return;
    }
    setImgUrl(parsed.image);
    setHref(parsed.href);
    setError(null);
  }, [link]);

  const save = () => {
    localStorage.setItem(storageKey, link.trim());
    setSaved(link.trim());
  };

  const refresh = () => setTs(Date.now());

  const containerStyles =
    'fixed top-4 left-4 z-50 rounded-2xl shadow-xl border border-white/10 bg-[#0b1424]/80 backdrop-blur p-3 w-[min(92vw,420px)]';

  const btn =
    'px-3 h-9 rounded-xl text-sm font-medium border border-white/10 hover:border-white/20 active:scale-[0.98] transition';

  return (
    <div className={containerStyles}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-sm font-semibold opacity-90">Chart Preview</div>
        <div className="flex items-center gap-2">
          <button className={btn} onClick={save} title="Save link">Save</button>
          <button className={btn} onClick={refresh} title="Refresh image">Refresh</button>
          {href ? (
            <a className={btn} href={href} target="_blank" rel="noreferrer" title="Open on TradingView">
              Open
            </a>
          ) : null}
        </div>
      </div>

      <input
        placeholder="Paste TradingView snapshot link…"
        value={link}
        onChange={(e) => setLink(e.target.value)}
        className="w-full mb-3 px-3 h-10 rounded-xl bg-white/5 border border-white/10 outline-none focus:border-white/25 text-sm"
      />

      {error ? (
        <div className="text-xs text-red-300">{error}</div>
      ) : imgUrl ? (
        <div className="overflow-hidden rounded-xl border border-white/10">
          {/* cache-buster via ts so Refresh forces a new fetch */}
          <img
            src={`${imgUrl}?t=${ts}`}
            alt="TradingView Snapshot"
            width={width}
            style={{ width, height: 'auto', display: 'block' }}
            onError={() =>
              setError('Could not load snapshot image (link ID may be wrong or snapshot not public).')
            }
          />
        </div>
      ) : (
        <div className="text-xs opacity-70">Paste a snapshot link to preview.</div>
      )}

      {saved && (
        <div className="mt-2 text-[11px] opacity-60">
          Saved link: <span className="break-all">{saved}</span>
        </div>
      )}
    </div>
  );
}
