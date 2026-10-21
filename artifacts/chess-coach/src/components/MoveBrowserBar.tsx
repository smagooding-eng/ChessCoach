import React from 'react';
import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, Radio } from 'lucide-react';
import type { MoveBrowser } from '@/hooks/use-move-browser';

/**
 * Step back through the moves of a game in progress, and one tap back to the
 * current position. While looking back, a green "Back to game" button shows
 * (it pulses when it's your move).
 */
export function MoveBrowserBar({ browser, yourTurn = false, className = '' }: { browser: MoveBrowser; yourTurn?: boolean; className?: string }) {
  const btn = 'grid h-9 w-10 place-items-center rounded-lg transition-colors active:scale-95 disabled:opacity-30';
  const btnStyle = { background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)', color: '#E5E7E6' };
  const moveNo = (i: number) => (i === 0 ? 'Start' : `Move ${Math.ceil(i / 2)}${i % 2 === 1 ? '' : '…'}`);
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <button type="button" className={btn} style={btnStyle} onClick={browser.first} disabled={!browser.canBack} aria-label="First move"><ChevronsLeft size={18} /></button>
      <button type="button" className={btn} style={btnStyle} onClick={browser.back} disabled={!browser.canBack} aria-label="Previous move"><ChevronLeft size={18} /></button>
      <button type="button" className={btn} style={btnStyle} onClick={browser.forward} disabled={!browser.canForward} aria-label="Next move"><ChevronRight size={18} /></button>
      <button type="button" className={btn} style={btnStyle} onClick={browser.toLive} disabled={!browser.viewing} aria-label="Current position"><ChevronsRight size={18} /></button>
      <div className="min-w-0 flex-1 text-right">
        {browser.viewing ? (
          <button type="button" onClick={browser.toLive}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-extrabold ${yourTurn ? 'animate-pulse' : ''}`}
            style={{ background: '#81B64C', color: '#FFFFFF' }}>
            <Radio size={14} /> {yourTurn ? 'Your move: back to game' : 'Back to game'}
          </button>
        ) : (
          <span className="text-[12px] font-semibold" style={{ color: 'rgba(229,231,230,.55)' }}>
            {browser.total === 0 ? 'No moves yet' : `${moveNo(browser.index)} · live`}
          </span>
        )}
        {browser.viewing && <span className="sr-only">Viewing {moveNo(browser.index)} of {browser.total}</span>}
      </div>
    </div>
  );
}
