import React from 'react';
import { PLAY_STORE_URL, shouldShowPlayBadge } from '@/lib/playApp';

/** The four-colour Google Play triangle. */
export function PlayLogo({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 28 32" width={size * 28 / 32} height={size} className={className} aria-hidden="true">
      <polygon points="0,1 15,16 0,31" fill="#00A0FF" />
      <polygon points="0,1 20.5,11 15,16" fill="#00D26A" />
      <polygon points="20.5,11 27.5,15 27.5,17 20.5,21 15,16" fill="#FFC400" />
      <polygon points="0,31 15,16 20.5,21" fill="#FF3A44" />
    </svg>
  );
}

/** "GET IT ON Google Play" badge linking to the store listing. Renders
 *  nothing inside the Play app itself (or on iPhone). */
export function GooglePlayBadge({ height = 48, className = '', force = false }: { height?: number; className?: string; force?: boolean }) {
  if (!force && !shouldShowPlayBadge()) return null;
  return (
    <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" aria-label="Get it on Google Play"
      className={`inline-block shrink-0 transition-transform active:scale-[0.97] hover:-translate-y-px ${className}`}>
      <svg viewBox="0 0 180 54" height={height} width={height * 180 / 54} role="img">
        <rect x="0.5" y="0.5" width="179" height="53" rx="9" fill="#000" stroke="#A6A6A6" />
        <g transform="translate(14 11)">
          <polygon points="0,1 15,16 0,31" fill="#00A0FF" />
          <polygon points="0,1 20.5,11 15,16" fill="#00D26A" />
          <polygon points="20.5,11 27.5,15 27.5,17 20.5,21 15,16" fill="#FFC400" />
          <polygon points="0,31 15,16 20.5,21" fill="#FF3A44" />
        </g>
        <text x="54" y="21" fill="#fff" fontFamily="'DM Sans', Arial, sans-serif" fontSize="9.5" fontWeight="600" letterSpacing="0.6">GET IT ON</text>
        <text x="53" y="42" fill="#fff" fontFamily="'DM Sans', Arial, sans-serif" fontSize="21" fontWeight="600" letterSpacing="-0.2">Google Play</text>
      </svg>
    </a>
  );
}

/** Small home-screen card: "Get the Android app" with the badge. */
export function PlayAppCard({ className = '' }: { className?: string }) {
  if (!shouldShowPlayBadge()) return null;
  return (
    <section className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3 ${className}`}
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="min-w-0">
        <p className="text-[14px] font-extrabold" style={{ color: '#EDEDED' }}>Get the Android app</p>
        <p className="text-[12px]" style={{ color: '#9E9B98' }}>Faster, full-screen, with move alerts.</p>
      </div>
      <GooglePlayBadge height={40} />
    </section>
  );
}
