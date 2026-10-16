import React from 'react';
import { Link } from 'wouter';
import { RD } from '@/lib/redesignTheme';

// Minimal frame for public pages a signed-out visitor can open from a link
// (tournaments): logo + sign-up, then the page itself.
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: RD.bg, color: RD.text }}>
      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 px-4 py-3" style={{ background: 'rgba(5,10,11,.92)', borderBottom: `1px solid ${RD.border}`, backdropFilter: 'blur(10px)' }}>
        <Link href="/" className="flex items-center gap-2">
          <img src={`${import.meta.env.BASE_URL}images/logo.svg`} alt="" className="h-8 w-8" />
          <span className="text-[17px] font-black">ChessScout<span style={{ color: RD.green }}>.net</span></span>
        </Link>
        <Link href="/setup" className="rounded-xl px-3.5 py-2 text-[13px] font-extrabold" style={{ background: RD.green, color: '#FFFFFF' }}>Sign up free</Link>
      </header>
      <main className="pt-4">{children}</main>
    </div>
  );
}
