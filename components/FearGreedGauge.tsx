// components/FearGreedGauge.tsx
"use client";

type Props = {
  value: number; // 0..100
  label: string; // classification
};

function colorFor(v: number) {
  if (v < 25) return "#ef4444";        // red
  if (v < 45) return "#f59e0b";        // amber
  if (v < 55) return "#eab308";        // yellow
  if (v < 75) return "#84cc16";        // lime
  return "#22c55e";                    // green
}

export default function FearGreedGauge({ value, label }: Props) {
  const v = Math.max(0, Math.min(100, value));
  const start = Math.PI; // 180°
  const end = 0;         // 0°
  const angle = start + (end - start) * (v / 100);

  const cx = 120, cy = 120, r = 100;
  const x = cx + r * Math.cos(angle);
  const y = cy + r * Math.sin(angle);
  const needle = `M ${cx} ${cy} L ${x} ${y}`;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white/90">Fear &amp; Greed</h3>
        <span className="text-[10px] text-white/50">Data: alternative.me</span>
      </div>

      <svg viewBox="0 0 240 140" className="w-full">
        {/* background arc */}
        <path
          d="M20 120 A 100 100 0 0 1 220 120"
          fill="none"
          stroke="#1f2937"
          strokeWidth={20}
          strokeLinecap="round"
        />
        {/* colored segments */}
        {[
          { from: 180, to: 225, c: "#ef4444" },
          { from: 225, to: 255, c: "#f59e0b" },
          { from: 255, to: 285, c: "#eab308" },
          { from: 285, to: 315, c: "#84cc16" },
          { from: 315, to: 360, c: "#22c55e" },
        ].map((seg, i) => {
          const a1 = (Math.PI * seg.from) / 180;
          const a2 = (Math.PI * seg.to) / 180;
          const x1 = cx + r * Math.cos(a1);
          const y1 = cy + r * Math.sin(a1);
          const x2 = cx + r * Math.cos(a2);
          const y2 = cy + r * Math.sin(a2);
          const largeArc = seg.to - seg.from > 180 ? 1 : 0;
          return (
            <path
              key={i}
              d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
              fill="none"
              stroke={seg.c}
              strokeWidth={14}
              strokeLinecap="round"
            />
          );
        })}

        {/* needle */}
        <path d={needle} stroke={colorFor(v)} strokeWidth={6} />
        <circle cx={cx} cy={cy} r={6} fill="white" />
      </svg>

      <div className="mt-2 flex items-baseline gap-2">
        <div className="text-2xl font-bold text-white">{Math.round(v)}</div>
        <div className="text-sm text-white/70">{label}</div>
      </div>
    </div>
  );
}
