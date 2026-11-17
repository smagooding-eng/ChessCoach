// A player's country flag, or a small bot for bot opponents (no "Bot" text on screen).
// Hover or tap it to see what it is: the country's name, or "Bot".
import { useEffect, useState } from 'react';
import { Bot } from 'lucide-react';

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
        {bot
          ? <span className="inline-flex items-center justify-center rounded-[4px]" style={{ width: size + 4, height: size, background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.18)' }}>
              <Bot size={size - 3} strokeWidth={2.4} color="#C9CFCD" />
            </span>
          : emoji}
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
