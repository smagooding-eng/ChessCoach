// One share button for every card in the app. Tapping it draws the card as an
// image and opens the phone's share sheet with the picture and the link (so it
// can go straight to Instagram, WhatsApp, Reddit...). Where a browser can't
// share files, a preview opens with Download and Copy link instead.
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Share2, Download, Link2, X, Loader2, Check } from 'lucide-react';
import { renderShareImage, type ShareSpec } from '@/lib/shareImage';

interface Props {
  spec: ShareSpec | (() => ShareSpec | null);
  /** The link that goes with the picture; defaults to chessscout.net. */
  url?: string;
  /** The message that goes with it. */
  text: string;
  /** File name without extension. */
  name?: string;
  label?: ReactNode;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}

export const SHARE_BASE = 'https://chessscout.net';

export function ShareButton({ spec, url = `${SHARE_BASE}/?ref=share`, text, name = 'chessscout', label, className, style, ariaLabel }: Props) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ blob: Blob; href: string } | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.href); }, [preview]);

  const go = async () => {
    if (busy) return;
    const s = typeof spec === 'function' ? spec() : spec;
    if (!s) return;
    setBusy(true);
    try {
      const blob = await renderShareImage(s);
      if (!blob) return;
      const file = new File([blob], `${name}.png`, { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        try { await nav.share({ files: [file], text: `${text} ${url}`, title: 'ChessScout.net' }); return; }
        catch (e) { if ((e as Error)?.name === 'AbortError') return; /* fall back to the preview */ }
      }
      setPreview({ blob, href: URL.createObjectURL(blob) });
    } finally { setBusy(false); }
  };

  const download = () => {
    if (!preview) return;
    const a = document.createElement('a');
    a.href = preview.href; a.download = `${name}.png`; a.click();
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(`${text} ${url}`); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ }
  };

  return (
    <>
      <button type="button" onClick={go} disabled={busy} aria-label={ariaLabel ?? 'Share'} className={className ?? 'inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-extrabold'}
        style={style ?? { background: '#81B64C', color: '#fff' }}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Share2 size={15} />}{label ?? 'Share'}
      </button>
      {preview && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.78)' }} onClick={() => setPreview(null)}>
          <div className="w-full max-w-[380px] space-y-3 rounded-2xl p-3" style={{ background: '#141D1F', border: '1px solid #243033' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-[14px] font-black" style={{ color: '#F5F7F6' }}>Share</p>
              <button type="button" onClick={() => setPreview(null)} aria-label="Close" className="p-1" style={{ color: '#8E9996' }}><X size={18} /></button>
            </div>
            <img src={preview.href} alt="Share card" className="w-full rounded-xl" />
            <p className="text-center text-[11.5px]" style={{ color: '#8E9996' }}>Long-press the picture to save it, or:</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={download} className="inline-flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-extrabold" style={{ background: '#81B64C', color: '#fff' }}><Download size={15} /> Download</button>
              <button type="button" onClick={copy} className="inline-flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-extrabold" style={{ background: 'rgba(255,255,255,.08)', color: '#F5F7F6' }}>
                {copied ? <Check size={15} /> : <Link2 size={15} />} {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
