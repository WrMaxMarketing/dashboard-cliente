/** Anel de progresso em SVG (0..1). Marca opcional para o "ideal". */
export function Ring({
  value,
  marker,
  size = 132,
  stroke = 10,
  color = "var(--t-gold)",
  children,
  label,
}: {
  value: number | null;
  marker?: number | null;
  size?: number;
  stroke?: number;
  color?: string;
  children?: React.ReactNode;
  label: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value == null ? 0 : Math.max(0, Math.min(1, value));
  const m = marker == null ? null : Math.max(0, Math.min(1, marker));
  const angle = m == null ? 0 : m * 2 * Math.PI - Math.PI / 2;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(232,220,192,0.08)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`}
          style={{ filter: "drop-shadow(0 0 6px rgba(212,175,55,0.45))", transition: "stroke-dasharray 0.9s ease" }}
        />
      </svg>
      {m != null && (
        <span
          aria-hidden
          className="absolute h-3 w-[3px] rounded-full"
          style={{
            background: "var(--t-champagne)",
            left: size / 2 + r * Math.cos(angle) - 1.5,
            top: size / 2 + r * Math.sin(angle) - 6,
            transform: `rotate(${angle + Math.PI / 2}rad)`,
          }}
        />
      )}
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}
