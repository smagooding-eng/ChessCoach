import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'wouter';

export const CHESSCOM_GREEN = '#81b64c';
export const BRASS = '#c9a15c';
export const TEXT_LIGHT = '#e8e6e3';
export const TEXT_MUTED = '#9e9b98';

export const PANEL_STYLE: React.CSSProperties = {
  background: 'linear-gradient(180deg, #383532 0%, #2a2825 100%)',
  border: '1px solid rgba(255,255,255,0.06)',
  boxShadow:
    '0 18px 50px -16px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
};

export const HERO_PANEL_STYLE: React.CSSProperties = {
  background: 'linear-gradient(180deg, #383532 0%, #2a2825 100%)',
  border: '1px solid rgba(255,255,255,0.06)',
  boxShadow:
    '0 18px 50px -16px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
};

export const PRIMARY_BTN_STYLE: React.CSSProperties = {
  background: `linear-gradient(180deg, #95c45a 0%, ${CHESSCOM_GREEN} 100%)`,
  boxShadow:
    '0 4px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
};

export const SECONDARY_BTN_STYLE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.07)',
  color: TEXT_LIGHT,
  border: '1px solid rgba(255,255,255,0.1)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
};

// Type tokens — real weight hierarchy. Display headings use the serif
// (Fraunces); everything else stays on the sans body face. Nothing here
// defaults to font-black — weight is chosen per role, not maxed out.
export const t = {
  display: 'font-display font-semibold leading-[1.05]',
  displayStyle: { letterSpacing: '-0.02em' } as React.CSSProperties,
  heading: 'font-display text-base md:text-lg font-semibold',
  headingStyle: { letterSpacing: '-0.01em', color: TEXT_LIGHT } as React.CSSProperties,
  subheading: 'font-display text-sm md:text-base font-semibold',
  subheadingStyle: { letterSpacing: '-0.01em', color: TEXT_LIGHT } as React.CSSProperties,
  eyebrow: 'text-[10px] font-semibold uppercase tracking-[0.14em]',
  body: 'text-sm',
  bodyMuted: 'text-sm',
  bodyMutedStyle: { color: TEXT_MUTED } as React.CSSProperties,
  small: 'text-xs',
  /** For move notation, ratings, accuracy figures — anything meant to read
   *  like a scoreboard or a clock display. */
  numeric: 'font-mono font-semibold tabular-nums',
};

// Engraved brass-plate tile for a section's chess-piece motif. Deliberately
// restrained: a flat plate with an inset edge (like a plaque), a thin
// piece silhouette rather than an oversized bold glyph, and no gradient
// sheen — the opposite of the glossy-gradient-square icon pattern.
export function PieceTile({
  piece,
  size = 44,
  tone = 'green',
}: {
  piece: '♚' | '♛' | '♜' | '♝' | '♞' | '♟';
  size?: number;
  tone?: 'green' | 'brass';
}) {
  const accent = tone === 'brass' ? BRASS : CHESSCOM_GREEN;
  return (
    <div
      className="relative shrink-0 rounded-lg flex items-center justify-center overflow-hidden"
      style={{
        width: size,
        height: size,
        background: '#211f1c',
        boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.05), inset 0 2px 4px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.03)`,
      }}
    >
      <span
        style={{
          fontSize: Math.round(size * 0.56),
          lineHeight: 1,
          color: accent,
          opacity: 0.9,
          fontFamily:
            '"Segoe UI Symbol", "Apple Symbols", "DejaVu Sans", "Arial Unicode MS", sans-serif',
        }}
      >
        {piece}
      </span>
    </div>
  );
}

// Standard panel container — replacement for ad-hoc Card components.
export function Panel({
  children,
  className = '',
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl p-4 md:p-5 ${className}`}
      style={{ ...PANEL_STYLE, ...style }}
    >
      {children}
    </div>
  );
}

// Section header with chess-piece plate + title + optional link.
export function SectionHeader({
  piece,
  title,
  badge,
  linkHref,
  linkText,
  size = 40,
}: {
  piece: '♚' | '♛' | '♜' | '♝' | '♞' | '♟';
  title: string;
  badge?: React.ReactNode;
  linkHref?: string;
  linkText?: string;
  size?: number;
}) {
  return (
    <div className="relative flex items-center justify-between mb-4">
      <div className="flex items-center gap-3 min-w-0">
        <PieceTile piece={piece} size={size} />
        <h2 className={`${t.heading} flex items-center gap-2 truncate`} style={t.headingStyle}>
          {title}
          {badge}
        </h2>
      </div>
      {linkHref && linkText && (
        <Link
          href={linkHref}
          className={`${t.eyebrow} flex items-center gap-0.5 hover:underline shrink-0`}
          style={{ color: CHESSCOM_GREEN }}
        >
          {linkText} <ChevronRight className="w-3 h-3" />
        </Link>
      )}
    </div>
  );
}

// Page-level wrapper used by every page.
export function PageShell({ children }: { children: React.ReactNode }) {
  return <div className="space-y-4 md:space-y-5 px-3 md:px-0">{children}</div>;
}

// Standardized page hero / title block.
export function PageHero({
  piece,
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  piece?: '♚' | '♛' | '♜' | '♝' | '♞' | '♟';
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden p-4 md:p-5 rounded-2xl" style={HERO_PANEL_STYLE}>
      <div className="relative flex items-start gap-4">
        {piece && <PieceTile piece={piece} size={52} />}
        <div className="flex-1 min-w-0">
          {eyebrow && (
            <span className={`${t.eyebrow} inline-flex items-center gap-1 px-1.5 py-0.5 rounded mb-1.5`} style={{ background: 'rgba(129,182,76,0.14)', color: CHESSCOM_GREEN, border: '1px solid rgba(129,182,76,0.25)' }}>
              {eyebrow}
            </span>
          )}
          <h1
            className="font-display text-2xl md:text-[1.75rem] font-semibold leading-[1.05]"
            style={{ letterSpacing: '-0.015em', color: TEXT_LIGHT }}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm mt-2" style={{ color: TEXT_MUTED }}>
              {subtitle}
            </p>
          )}
          {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}

// Refined text input — replaces the flat, undifferentiated inputs used
// ad-hoc across pages with one consistent, tactile field style.
export function TextField({
  className = '',
  style,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all placeholder:text-[13px] ${className}`}
      style={{
        background: 'rgba(0,0,0,0.22)',
        border: '1px solid rgba(255,255,255,0.09)',
        color: TEXT_LIGHT,
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.3)',
        ...style,
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = 'rgba(129,182,76,0.5)';
        e.currentTarget.style.boxShadow = 'inset 0 1px 3px rgba(0,0,0,0.3), 0 0 0 3px rgba(129,182,76,0.12)';
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)';
        e.currentTarget.style.boxShadow = 'inset 0 1px 3px rgba(0,0,0,0.3)';
        props.onBlur?.(e);
      }}
    />
  );
}

// A stat display styled like a scoreboard/clock readout — for accuracy,
// ratings, streaks. This is the signature numeric treatment referenced
// throughout the app instead of plain bold sans numbers.
export function StatReadout({
  value,
  label,
  tone = 'default',
}: {
  value: string | number;
  label: string;
  tone?: 'default' | 'brass' | 'positive' | 'negative';
}) {
  const color =
    tone === 'brass' ? BRASS :
    tone === 'positive' ? CHESSCOM_GREEN :
    tone === 'negative' ? '#c1493d' :
    TEXT_LIGHT;
  return (
    <div className="flex flex-col items-center">
      <span className={t.numeric} style={{ fontSize: '1.5rem', color }}>{value}</span>
      <span className={`${t.eyebrow} mt-1`} style={{ color: TEXT_MUTED }}>{label}</span>
    </div>
  );
}
