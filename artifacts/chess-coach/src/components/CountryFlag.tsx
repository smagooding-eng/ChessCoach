// A player's country flag, or a small bot for bot opponents (no "Bot" text on screen).
// Hover or tap it to see what it is: the country's name, or "Bot".
import { useEffect, useState } from 'react';

/** "US" (or a Chess.com country URL ending in /US) to its flag emoji. */
export function flagEmoji(country?: string | null): string {
  const code = country?.split('/').pop()?.trim().toUpperCase();
  return code && /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '';
}

let names: Intl.DisplayNames | null = null;
export function countryLabel(country?: string | null): string {
  const code = country?.split('/').pop()?.trim().toUpperCase() ?? '';
  if (!/^[A-Z]{2}$/.test(code)) return '';
  try { names ??= new Intl.DisplayNames(['en'], { type: 'region' }); return names.of(code) ?? code; } catch { return code; }
}

/** The bot's flag: a waving flag like the emoji ones, ChessScout green with a robot face. */
const CLOTH = "M1.2 3.4 C 8 -0.6, 14.5 6.2, 26.8 2.2 L 26.8 16.6 C 14.5 20.6, 8 13.8, 1.2 17.8 Z";
function BotFlag({ h }: { h: number }) {
  const w = Math.round(h * 1.4);
  return (
    <svg width={w} height={h} viewBox="0 0 28 20" aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id="cs-botflag" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#93C95C" /><stop offset="1" stopColor="#5C8C33" />
        </linearGradient>
        {/* light and shade across the folds */}
        <linearGradient id="cs-botflag-folds" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity=".22" /><stop offset=".22" stopColor="#000" stopOpacity=".14" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".18" /><stop offset=".78" stopColor="#000" stopOpacity=".14" />
          <stop offset="1" stopColor="#fff" stopOpacity=".12" />
        </linearGradient>
        <clipPath id="cs-botflag-clip"><path d={CLOTH} /></clipPath>
      </defs>
      <path d={CLOTH} fill="url(#cs-botflag)" />
      <g clipPath="url(#cs-botflag-clip)">
        {/* robot head, riding the wave a little */}
        <g transform="translate(14 10.2) skewY(-6) translate(-14 -10.2)">
          <line x1="14" y1="4.2" x2="14" y2="6" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" />
          <circle cx="14" cy="3.9" r="1" fill="#fff" />
          <rect x="8.6" y="6.2" width="10.8" height="8.4" rx="2.2" fill="#fff" />
          <circle cx="11.7" cy="10" r="1.35" fill="#3E6524" />
          <circle cx="16.3" cy="10" r="1.35" fill="#3E6524" />
          <rect x="12" y="12.4" width="4" height="1.05" rx="0.5" fill="#3E6524" />
          <rect x="6.9" y="8.8" width="1.4" height="2.9" rx="0.7" fill="#fff" />
          <rect x="19.7" y="8.8" width="1.4" height="2.9" rx="0.7" fill="#fff" />
        </g>
        <rect x="0" y="0" width="28" height="20" fill="url(#cs-botflag-folds)" />
      </g>
      <path d={CLOTH} fill="none" stroke="rgba(0,0,0,.28)" strokeWidth=".8" />
    </svg>
  );
}

export function CountryFlag({ country, bot = false, size = 15, className = '' }: { country?: string | null; bot?: boolean; size?: number; className?: string }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  useEffect(() => { if (!open) return; const t = setTimeout(() => setOpen(false), 2200); return () => clearTimeout(t); }, [open]);
  const emoji = bot ? '' : flagEmoji(country);
  const label = bot ? 'Bot' : countryLabel(country);
  if (!bot && !emoji) return null;
  return (
    <span className={`relative inline-flex ${className}`}>
      <button type="button" aria-label={label} onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        className="inline-flex items-center justify-center leading-none" style={{ fontSize: size, lineHeight: 1, cursor: 'pointer', background: 'none', border: 0, padding: 0 }}>
        {bot ? <BotFlag h={Math.round(size * 0.95)} /> : emoji}
      </button>
      {(open || hover) && label && (
        <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-bold"
          style={{ background: '#0B1213', color: '#F5F7F6', border: '1px solid rgba(255,255,255,.16)', boxShadow: '0 6px 18px rgba(0,0,0,.45)' }}>
          {label}
        </span>
      )}
    </span>
  );
}
