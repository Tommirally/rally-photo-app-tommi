import type { DemoPreview } from "@/lib/types";

const SCENES: Record<DemoPreview["scene"], { sky: [string, string]; ground: string; trees: string }> = {
  forest: { sky: ["#9fc5a8", "#dfeee0"], ground: "#6b5b3e", trees: "#1f4d2b" },
  gravel: { sky: ["#bcd4e6", "#eef4f8"], ground: "#a08d6b", trees: "#3d6b45" },
  tarmac: { sky: ["#c7d2de", "#f1f4f7"], ground: "#4b5563", trees: "#4a6b3f" },
  dusk: { sky: ["#f59e7a", "#fde2c8"], ground: "#5b4a3a", trees: "#2d2a3a" },
};

/**
 * Drawn placeholder standing in for a real rally photo in the demo.
 * Shows the tagged car number(s) on the door so results are easy to check.
 */
export function PhotoPlaceholder({
  preview,
  numbers,
  label,
}: {
  preview: DemoPreview;
  numbers: string[];
  label: string;
}) {
  const s = SCENES[preview.scene];
  const id = `g-${preview.scene}`;
  const cars = numbers.length > 0 ? numbers : ["?"];
  return (
    <svg viewBox="0 0 400 260" role="img" aria-label={label} className="placeholder">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={s.sky[0]} />
          <stop offset="1" stopColor={s.sky[1]} />
        </linearGradient>
      </defs>
      <rect width="400" height="260" fill={`url(#${id})`} />
      {[20, 70, 120, 290, 340, 385].map((x, i) => (
        <polygon key={x} points={`${x - 22},150 ${x},${60 + (i % 3) * 14} ${x + 22},150`} fill={s.trees} />
      ))}
      <rect y="150" width="400" height="110" fill={s.ground} />
      <path d="M0 210 Q200 170 400 205 L400 260 L0 260Z" fill="rgba(0,0,0,0.12)" />
      {cars.map((num, i) => {
        const offset = cars.length === 1 ? 0 : i === 0 ? -95 : 95;
        const scale = cars.length === 1 ? 1 : 0.78;
        return (
          <g key={num + i} transform={`translate(${200 + offset} 190) scale(${scale}) translate(-120 -45)`}>
            <ellipse cx="120" cy="88" rx="120" ry="10" fill="rgba(0,0,0,0.25)" />
            <path
              d="M10 70 L18 42 L70 36 L100 12 L170 12 L200 36 L232 44 L238 70 Z"
              fill={preview.carColour}
              stroke="#111"
              strokeWidth="2"
            />
            <path d="M106 18 L164 18 L186 36 L84 36 Z" fill="#cbd5e1" stroke="#111" strokeWidth="1.5" />
            <rect x="92" y="40" width="64" height="28" rx="4" fill="#fff" stroke="#111" strokeWidth="1.5" />
            <text
              x="124"
              y="61"
              textAnchor="middle"
              fontFamily="Arial, Helvetica, sans-serif"
              fontWeight="700"
              fontSize={num.length > 2 ? 20 : 24}
              fill="#111"
            >
              {num}
            </text>
            <circle cx="55" cy="74" r="16" fill="#1f2937" />
            <circle cx="55" cy="74" r="7" fill="#9ca3af" />
            <circle cx="190" cy="74" r="16" fill="#1f2937" />
            <circle cx="190" cy="74" r="7" fill="#9ca3af" />
          </g>
        );
      })}
      <text
        x="200"
        y="34"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight="700"
        fontSize="22"
        fill="rgba(255,255,255,0.75)"
        stroke="rgba(0,0,0,0.25)"
        strokeWidth="1"
        letterSpacing="6"
      >
        DEMO PLACEHOLDER
      </text>
    </svg>
  );
}
