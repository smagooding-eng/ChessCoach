import React, { useState } from 'react';
import { Copy, Check, Share2 } from 'lucide-react';
import { PT, greenBtn, ghostBtn } from '@/lib/playTheme';

// The challenge link with Copy and (on phones) the native Share sheet.
export function ShareLink({ url, text }: { url: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); } catch {
      const t = document.createElement('textarea'); t.value = url; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); } catch { /* ignore */ } t.remove();
    }
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className="space-y-2">
      <div className="truncate rounded-xl px-3 py-2.5 font-mono text-[12.5px]" style={{ background: 'rgba(0,0,0,.3)', border: `1px solid ${PT.border}`, color: PT.text }}>{url}</div>
      <div className="flex gap-2">
        <button onClick={copy} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-extrabold" style={canShare ? ghostBtn : greenBtn}>
          {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy link'}
        </button>
        {canShare && (
          <button onClick={() => navigator.share({ title: 'ChessScout challenge', text, url }).catch(() => {})} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-extrabold" style={greenBtn}>
            <Share2 size={15} /> Share
          </button>
        )}
      </div>
    </div>
  );
}
