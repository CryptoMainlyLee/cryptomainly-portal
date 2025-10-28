// components/AltseasonBar.tsx
"use client";

type Props = {
  value: number; // 0..100
  label: string;
};

export default function AltseasonBar({ value, label }: Props) {
  const v = Math.max(0, Math.min(100, value));

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white/90">Altcoin Season</h3>
        <span className="text-[10px] text-white/50">Data: blockchaincenter.net</span>
      </div>

      <div className="mb-2 text-2xl font-bold text-white">
        {Math.round(v)}<span className="text-white/60 text-base">/100</span>
      </div>

      <div className="mb-1 flex justify-between text-[11px] text-white/70">
        <span>Bitcoin</span>
        <span>Altcoin</span>
      </div>

      <div className="relative h-3 w-full overflow-hidden rounded-full bg-white/10">
        {/* gradient track */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, #f59e0b 0%, #fcd34d 40%, #93c5fd 65%, #3b82f6 100%)",
          }}
        />
        {/* knob */}
        <div
          className="absolute top-1/2 -translate-y-1/2"
          style={{ left: `calc(${v}% - 10px)` }}
        >
          <div className="h-5 w-5 rounded-full border-2 border-white bg-black/40 backdrop-blur" />
        </div>
      </div>

      <div className="mt-2 text-sm text-white/80">{label}</div>
    </div>
  );
}
