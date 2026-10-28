import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Radio } from 'lucide-react';
import type { MoveBrowser } from '@/hooks/use-move-browser';
import { useHoldRepeat } from '@/hooks/use-hold-repeat';
import { vibrateFor } from '@/context/SettingsContext';

// Look back through a game in progress (live, daily, bots) without leaving it.
// Big buttons under the board; hold the arrows to speed through. While looking
// back, one tap returns to the live position.
export function MoveBrowserBar({ browser, yourTurn = false, className = '' }: { browser: MoveBrowser; yourTurn?: boolean; className?: string }) {
  const holdBack = useHoldRepeat(() => { if (!browser.canBack) return false; vibrateFor('move'); browser.back(); return true; });
  const holdFwd = useHoldRepeat(() => { if (!browser.canForward) return false; vibrateFor('move'); browser.forward(); return true; });
  const btn = 'flex h-11 items-center justify-center rounded-[12px] transition-transform active:scale-95 disabled:opacity-30';
  const btnStyle: React.CSSProperties = { background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)', color: '#E5E7E6' };
  const moveNo = (i: number) => (i === 0 ? 'the start' : `move ${Math.ceil(i / 2)}${i % 2 === 1 ? '' : '…'}`);
  return (
    <div className={className}>
      <div className="grid grid-cols-4 gap-2">
        <button type="button" className={btn} style={btnStyle} onClick={browser.first} disabled={!browser.canBack} aria-label="First move"><ChevronsLeft size={20} /></button>
        <button type="button" className={btn} {...holdBack} style={{ ...btnStyle, ...holdBack.style }} disabled={!browser.canBack} aria-label="Previous move"><ChevronLeft size={22} /></button>
        <button type="button" className={btn} {...holdFwd} style={{ ...btnStyle, ...holdFwd.style }} disabled={!browser.canForward} aria-label="Next move"><ChevronRight size={22} /></button>
        <button type="button" className={btn} style={browser.viewing ? { ...btnStyle, background: '#81B64C', color: '#fff' } : btnStyle} onClick={browser.toLive} disabled={!browser.viewing} aria-label="Back to the game"><ChevronsRight size={20} /></button>
      </div>
      {/* Always one line tall, so nothing around it moves. */}
      <div className="mt-1.5 flex h-8 items-center justify-center">
        {browser.viewing ? (
          <button type="button" onClick={browser.toLive}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-extrabold ${yourTurn ? 'animate-pulse' : ''}`}
            style={{ background: '#81B64C', color: '#FFFFFF' }}>
            <Radio size={14} /> Viewing {moveNo(browser.index)}: {yourTurn ? 'your move, back to game' : 'back to game'}
          </button>
        ) : (
          <span className="text-[12px] font-semibold" style={{ color: 'rgba(229,231,230,.55)' }}>
            {browser.total === 0 ? 'No moves yet' : 'Use the arrows to look back through the game'}
          </span>
        )}
      </div>
    </div>
  );
}
