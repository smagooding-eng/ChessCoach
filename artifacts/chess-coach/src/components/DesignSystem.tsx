import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'wouter';

export const CHESSCOM_GREEN = '#81b64c';
export const TEXT_LIGHT = '#e8e6e3';
export const TEXT_MUTED = '#9e9b98';

export const PANEL_STYLE: React.CSSProperties = {
  background: 'linear-gradient(180deg, #353230 0%, #2b2926 100%)',
  border: '1px solid rgba(255,255,255,0.06)',
  boxShadow:
    '0 8px 24px -10px rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
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

// Type tokens
export const t = {
  display: 'font-black leading-none',
  displayStyle: { letterSpacing: '-0.02em' } as React.CSSProperties,
  heading: 'text-base md:text-lg font-black',
  headingStyle: { letterSpacing: '-0.01em', color: TEXT_LIGHT } as React.CSSProperties,
  subheading: 'text-sm md:text-base font-black',
  subheadingStyle: { letterSpacing: '-0.01em', color: TEXT_LIGHT } as React.CSSProperties,
  eyebrow: 'text-[10px] font-black uppercase tracking-[0.18em]',
  body: 'text-sm',
  bodyMuted: 'text-sm',
  bodyMutedStyle: { color: TEXT_MUTED } as React.CSSProperties,
  small: 'text-xs',
};

// A square chess-piece illustration tile used as section visuals (chess.com style).
export function PieceTile({
  piece,
  size = 44,
}: {
  piece: '♚' | '♛' | '♜' | '♝' | '♞' | '♟';
  size?: number;
}) {
  return (
    <div
      className="relative shrink-0 rounded-xl flex items-center justify-center overflow-hidden"
      style={{
        width: size,
        height: size,
        background: 'linear-gradient(160deg, #8fc556 0%, #6a9c3c 55%, #4f7a2a 100%)',
        boxShadow:
          '0 4px 10px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -2px 0 rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.4)',
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at 30% 25%, rgba(255,255,255,0.18), transparent 55%)',
        }}
      />
      <span
        style={{
          fontSize: Math.round(size * 0.72),
          lineHeight: 1,
          color: '#ffffff',
          textShadow: '0 2px 3px rgba(0,0,0,0.45), 0 0 1px rgba(0,0,0,0.6)',
          fontFamily:
            '"Segoe UI Symbol", "Apple Symbols", "DejaVu Sans", "Arial Unicode MS", sans-serif',
          marginTop: -2,
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

// Section header with chess-piece visual + title + optional link.
export function SectionHeader({
  piece,
  title,
  badge,
  linkHref,
  linkText,
  size = 44,
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
        {piece && <PieceTile piece={piece} size={56} />}
        <div className="flex-1 min-w-0">
          {eyebrow && (
            <span className={`${t.eyebrow} block mb-1`} style={{ color: CHESSCOM_GREEN }}>
              {eyebrow}
            </span>
          )}
          <h1
            className="text-2xl md:text-3xl font-black truncate leading-none"
            style={{ ...t.displayStyle, color: TEXT_LIGHT, textShadow: '0 2px 8px rgba(0,0,0,0.3)' }}
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
