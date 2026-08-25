import { useEffect } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Smartphone, ShieldCheck, Sparkles, Check } from 'lucide-react';

const G = '#81b64c';
const BG = '#262421';
const CARD = '#302e2b';
const TEXT = '#e8e6e3';
const MUTED = '#9e9b98';

const PLAY_STORE_HREF = 'https://play.google.com/store/apps/details?id=net.chessscout.app';

export default function DownloadPage() {
  useEffect(() => {
    document.title = 'Download the ChessScout.net App';
  }, []);

  return (
    <div className="min-h-screen" style={{ background: BG, color: TEXT }}>
      <nav className="sticky top-0 z-40 backdrop-blur-xl" style={{ background: `${BG}dd`, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-8 h-14 flex items-center justify-between">
          <Link href="/setup" className="flex items-center gap-1.5 text-sm font-medium transition-colors" style={{ color: MUTED }}>
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
          <div className="flex items-center gap-0.5">
            <span className="text-lg font-black" style={{ color: TEXT }}>Chess</span>
            <span className="text-lg font-black" style={{ color: G }}>Scout</span>
            <span className="text-sm font-bold ml-0.5" style={{ color: MUTED }}>.net</span>
          </div>
        </div>
      </nav>

      <section className="max-w-3xl mx-auto px-4 sm:px-8 pt-12 pb-20">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full mb-5 text-[11px] font-black tracking-wider"
            style={{ background: `${G}15`, color: G, border: `1px solid ${G}30` }}>
            <Smartphone className="w-3.5 h-3.5" /> ANDROID APP
          </div>
          <h1 className="text-4xl sm:text-5xl font-black leading-[1.05] tracking-tight mb-4" style={{ color: TEXT }}>
            Get the <span style={{ color: G }}>ChessScout.net</span> App
          </h1>
          <p className="text-base sm:text-lg max-w-xl mx-auto" style={{ color: MUTED }}>
            Install the official ChessScout.net app on your Android device to analyze games, scan positions, and train on the go.
          </p>
        </div>

        <div className="rounded-xl p-6 sm:p-8 mb-6"
          style={{
            background: `linear-gradient(180deg, ${CARD} 0%, #2a2825 100%)`,
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 30px 80px -20px rgba(0,0,0,0.7), 0 1px 0 rgba(255,255,255,0.05) inset',
          }}>
          <div className="flex flex-col sm:flex-row items-center gap-5">
            <div className="w-20 h-20 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: `${G}1a`, border: `1px solid ${G}33` }}>
              <Smartphone className="w-10 h-10" style={{ color: G }} />
            </div>
            <div className="flex-1 text-center sm:text-left">
              <p className="text-xs font-black uppercase tracking-widest mb-1" style={{ color: MUTED }}>
                ChessScout.net for Android
              </p>
              <h2 className="text-xl sm:text-2xl font-black mb-1" style={{ color: TEXT }}>
                ChessScout.net
              </h2>
              <p className="text-sm" style={{ color: MUTED }}>
                Available on Google Play · works on Android 8.0 and above
              </p>
            </div>
            <a
              href={PLAY_STORE_HREF}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 px-6 py-3.5 rounded-xl font-black text-sm transition-all shrink-0"
              style={{ background: G, color: '#fff', boxShadow: `0 12px 30px -6px ${G}66` }}
              onMouseEnter={e => { e.currentTarget.style.background = '#6fa23e'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = G; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <svg className="w-4 h-4" viewBox="0 0 512 512" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0zm425.2 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8zM104.6 499l280.8-161.2-60.1-60.1L104.6 499z"/>
              </svg>
              Download from Google Play
            </a>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { icon: ShieldCheck, label: 'Google Play verified' },
              { icon: Sparkles,    label: 'Full feature parity' },
              { icon: Smartphone,  label: 'Automatic updates' },
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <f.icon className="w-4 h-4" style={{ color: G }} />
                <span className="text-xs font-bold" style={{ color: TEXT }}>{f.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl p-5 sm:p-6"
          style={{ background: CARD, border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-start gap-2 p-3 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: G }} />
            <p className="text-xs" style={{ color: MUTED }}>
              iOS app coming soon. In the meantime you can use the full web app at any time at <span style={{ color: TEXT }}>chessscout.net</span>.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
