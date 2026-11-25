// "Get the Chrome extension": shown only where it can be installed (desktop Chrome and friends),
// hidden for good once closed.
import { useState } from 'react';
import { X, Puzzle } from 'lucide-react';
import { EXTENSION_URL, canInstallExtension, extensionCardHidden, hideExtensionCard } from '@/lib/extension';

export function ExtensionCard({ className = '' }: { className?: string }) {
  const [hidden, setHidden] = useState(() => !canInstallExtension() || extensionCardHidden());
  if (hidden) return null;
  return (
    <div className={`relative flex items-center gap-3.5 rounded-[18px] p-4 ${className}`} style={{ background: '#151D1F', border: '1px solid rgba(255,255,255,.08)' }}>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px]" style={{ background: '#212B2D', color: '#81B64C' }}><Puzzle size={22} /></span>
      <div className="min-w-0 flex-1 pr-5">
        <b className="block text-[15.5px] font-extrabold" style={{ color: '#F5F7F6' }}>Review every Chess.com game in one click</b>
        <span className="block text-[12.5px] leading-snug" style={{ color: '#8F9997' }}>Our free Chrome extension adds "Review in ChessScout" the moment a Chess.com game ends.</span>
      </div>
      <a href={EXTENSION_URL} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-[12px] px-3.5 py-2 text-[13px] font-extrabold text-white" style={{ background: '#81B64C' }}>Add to Chrome</a>
      <button onClick={() => { hideExtensionCard(); setHidden(true); }} aria-label="Hide" className="absolute right-2 top-2 p-1" style={{ color: '#8F9997' }}><X size={15} /></button>
    </div>
  );
}
