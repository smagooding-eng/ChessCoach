import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'wouter';
import { Palette, X } from 'lucide-react';

// The first time someone sees a game board, a small note at the bottom of
// the screen: pieces, board and theme can be changed in Settings. Shown once
// per browser (remembered in localStorage), never on the Settings page, and
// it fades out by itself. Boards call useBoardStyleTip(); only one note shows
// however many boards are on the page.

const KEY = 'cs_board_style_tip_seen';
let claimed = false;
const listeners = new Set<(v: boolean) => void>();

function seen(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return true; }
}

/** Call from any component that shows a playable/viewable board. */
export function useBoardStyleTip(): void {
  const [location] = useLocation();
  useEffect(() => {
    if (claimed || location.startsWith('/settings') || seen()) return;
    claimed = true;
    // a beat after the board appears; only then is it remembered as seen
    const t = setTimeout(() => {
      try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ }
      listeners.forEach((fn) => fn(true));
    }, 1200);
    return () => { clearTimeout(t); claimed = false; };
  }, [location]);
}

/** Mounted once (App): renders the note when a board asks for it. */
export function BoardStyleTipHost() {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  useEffect(() => {
    listeners.add(setOpen);
    return () => { listeners.delete(setOpen); };
  }, []);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setOpen(false), 14_000);
    return () => clearTimeout(t);
  }, [open]);
  useEffect(() => { if (location.startsWith('/settings')) setOpen(false); }, [location]);
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div role="status" className="cs-board-tip fixed inset-x-3 z-[70] mx-auto flex max-w-[460px] items-center gap-3 rounded-2xl px-3.5 py-3 shadow-2xl"
      style={{ bottom: 'calc(5.25rem + env(safe-area-inset-bottom))', background: '#0D1516', border: '1px solid rgba(129,182,76,.45)', color: '#F5F7F6', animation: 'cs-tip-in .35s ease-out' }}>
      <style>{'@keyframes cs-tip-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}'}</style>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: '#81B64C' }}><Palette size={18} color="#FFFFFF" /></span>
      <span className="min-w-0 flex-1 text-[13px] leading-snug">
        <b className="block text-[13.5px]">Make the board yours</b>
        <span style={{ color: '#9AA8A5' }}>Change your pieces, board and theme in Settings.</span>
      </span>
      <Link href="/settings" onClick={() => setOpen(false)} className="shrink-0 rounded-xl px-3 py-2 text-[12.5px] font-extrabold" style={{ background: '#81B64C', color: '#FFFFFF' }}>
        Customize
      </Link>
      <button onClick={() => setOpen(false)} aria-label="Dismiss" className="grid h-7 w-7 shrink-0 place-items-center rounded-full" style={{ color: '#9AA8A5' }}><X size={16} /></button>
    </div>,
    document.body,
  );
}
