import React from 'react';
import { X, Share, MoreVertical, PlusSquare, Download } from 'lucide-react';

const BG_CARD = '#302e2b';
const TEXT_LIGHT = '#e8e6e3';
const TEXT_MUTED = '#9e9b98';
const CHESSCOM_GREEN = '#81b64c';
const BORDER_COLOR = 'rgba(129,182,76,0.06)';

function IOSGuide() {
  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: TEXT_LIGHT }}>To install ChessScout on your iPhone or iPad:</p>
      <div className="space-y-3">
        <Step num={1}>
          Tap the <Share className="w-4 h-4 inline-block mx-1 -mt-0.5" style={{ color: CHESSCOM_GREEN }} /> <strong>Share</strong> button in Safari's toolbar
        </Step>
        <Step num={2}>
          Scroll down and tap <strong>"Add to Home Screen"</strong>
        </Step>
        <Step num={3}>
          Tap <strong>"Add"</strong> in the top right corner
        </Step>
      </div>
      <p className="text-xs" style={{ color: TEXT_MUTED }}>Note: This only works in Safari. If you're using Chrome or another browser, open this page in Safari first.</p>
    </div>
  );
}

function AndroidGuide() {
  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: TEXT_LIGHT }}>To install ChessScout on your Android device:</p>
      <div className="space-y-3">
        <Step num={1}>
          Tap the <MoreVertical className="w-4 h-4 inline-block mx-1 -mt-0.5" style={{ color: CHESSCOM_GREEN }} /> <strong>menu</strong> button (three dots) in Chrome
        </Step>
        <Step num={2}>
          Tap <strong>"Add to Home screen"</strong> or <strong>"Install app"</strong>
        </Step>
        <Step num={3}>
          Tap <strong>"Install"</strong> to confirm
        </Step>
      </div>
    </div>
  );
}

function DesktopGuide() {
  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: TEXT_LIGHT }}>To install ChessScout on your computer:</p>
      <div className="space-y-3">
        <Step num={1}>
          In Chrome, click the <Download className="w-4 h-4 inline-block mx-1 -mt-0.5" style={{ color: CHESSCOM_GREEN }} /> <strong>install icon</strong> in the address bar (right side)
        </Step>
        <Step num={2}>
          Or click the <MoreVertical className="w-4 h-4 inline-block mx-1 -mt-0.5" style={{ color: CHESSCOM_GREEN }} /> <strong>menu</strong> (three dots) and select <strong>"Install ChessScout.net"</strong>
        </Step>
        <Step num={3}>
          Click <strong>"Install"</strong> to confirm
        </Step>
      </div>
      <p className="text-xs" style={{ color: TEXT_MUTED }}>Works best in Chrome or Edge. Firefox and Safari don't fully support app installation on desktop.</p>
    </div>
  );
}

function Step({ num, children }: { num: number; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-black"
        style={{ background: 'rgba(129,182,76,0.15)', color: CHESSCOM_GREEN }}>
        {num}
      </div>
      <p className="text-sm leading-relaxed" style={{ color: TEXT_LIGHT }}>{children}</p>
    </div>
  );
}

export function InstallGuide({ platform, onClose, onDismiss }: {
  platform: 'ios' | 'android' | 'desktop';
  onClose: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-full max-w-sm rounded-xl overflow-hidden"
        style={{ background: BG_CARD, border: `1px solid ${BORDER_COLOR}` }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${BORDER_COLOR}` }}>
          <div className="flex items-center gap-2">
            <PlusSquare className="w-5 h-5" style={{ color: CHESSCOM_GREEN }} />
            <h3 className="font-bold text-sm" style={{ color: TEXT_LIGHT }}>Install ChessScout</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/5 transition-colors">
            <X className="w-4 h-4" style={{ color: TEXT_MUTED }} />
          </button>
        </div>
        <div className="px-4 py-4">
          {platform === 'ios' && <IOSGuide />}
          {platform === 'android' && <AndroidGuide />}
          {platform === 'desktop' && <DesktopGuide />}
        </div>
        <div className="px-4 py-3 flex justify-end gap-2" style={{ borderTop: `1px solid ${BORDER_COLOR}` }}>
          <button onClick={onDismiss} className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-white/5" style={{ color: TEXT_MUTED }}>
            Don't show again
          </button>
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors" style={{ background: CHESSCOM_GREEN, color: '#1a1a1a' }}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
