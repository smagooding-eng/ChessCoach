import React from 'react';

// The app's splash screen (index.html): the black rook jumps two squares and
// smashes the white pawn, then "ChessScout.net · Play smarter. Win more."
// Same drawing and timing, with its own class names and ids so it can sit in
// the Studio frame next to the real splash without clashing. Remount it (key)
// to replay.

const CSS = `
.ss-stage { width: 78cqw; height: auto; overflow: visible; }
.ss-stage * { transform-box: fill-box; }
.ss-shake { animation: ssShake .26s linear .68s 1; transform-origin: 50% 50%; }
@keyframes ssShake { 0% { transform: translate(0,0); } 20% { transform: translate(-3px,2px); } 40% { transform: translate(3px,-2px); } 60% { transform: translate(-2px,1px); } 80% { transform: translate(1px,-1px); } 100% { transform: translate(0,0); } }
.ss-board { opacity: 0; animation: ssFade .3s ease-out forwards; }
@keyframes ssFade { to { opacity: 1; } }
.ss-flash { opacity: 0; animation: ssFlash .7s ease-out .68s forwards; }
@keyframes ssFlash { 0% { opacity: .85; } 100% { opacity: .16; } }
.ss-rook-pos { transform: translate(60px,110px); animation: ssArc 1s linear forwards; }
@keyframes ssArc {
  0%, 28% { transform: translate(60px,110px); } 33% { transform: translate(75px,83px); } 38% { transform: translate(90px,63.5px); }
  43% { transform: translate(105px,51.9px); } 48% { transform: translate(120px,48px); } 53% { transform: translate(135px,51.9px); }
  58% { transform: translate(150px,63.5px); } 63% { transform: translate(165px,83px); } 68%, 100% { transform: translate(180px,110px); }
}
.ss-rook-body { transform-origin: 50% 100%; animation: ssSquash 1s cubic-bezier(.3,.7,.4,1) forwards; }
@keyframes ssSquash {
  0%, 20% { transform: scale(1,1) rotate(0); } 28% { transform: scale(1.1,.86) rotate(0); } 34% { transform: scale(.9,1.12) rotate(-7deg); }
  48% { transform: scale(1,1) rotate(3deg); } 63% { transform: scale(.94,1.08) rotate(2deg); } 68% { transform: scale(1.2,.78) rotate(0); }
  76% { transform: scale(.95,1.06); } 85% { transform: scale(1.03,.97); } 100% { transform: scale(1,1); }
}
.ss-shadow { transform-origin: 50% 50%; animation: ssShadow 1s linear forwards; }
@keyframes ssShadow { 0%, 28% { transform: translateX(0) scale(1); opacity: .55; } 48% { transform: translateX(60px) scale(.45); opacity: .2; } 68%, 100% { transform: translateX(120px) scale(1.05); opacity: .55; } }
.ss-glow { opacity: 0; transform-origin: 50% 50%; animation: ssGlowIn .6s ease-out .75s forwards, ssGlow 2.4s ease-in-out 1.35s infinite; }
@keyframes ssGlowIn { from { opacity: 0; transform: scale(.6); } to { opacity: .55; transform: scale(1); } }
@keyframes ssGlow { 0%, 100% { opacity: .55; } 50% { opacity: .25; } }
.ss-pawn { transform-origin: 50% 100%; animation: ssNervous .24s ease-in-out .4s 1, ssNervous .2s ease-in-out .58s 1; }
@keyframes ssNervous { 0%,100% { transform: rotate(0); } 25% { transform: rotate(-5deg); } 75% { transform: rotate(5deg); } }
.ss-shard { transform-origin: 50% 50%; animation: ssShard .62s cubic-bezier(.15,.6,.35,1) .68s forwards; }
@keyframes ssShard {
  0% { transform: translate(0,0) rotate(0); opacity: 1; }
  40% { transform: translate(calc(var(--dx) * .55), calc(var(--dy) * .7)) rotate(calc(var(--r) * .5)); opacity: 1; }
  100% { transform: translate(var(--dx), calc(var(--dy) + 16px)) rotate(var(--r)); opacity: 0; }
}
.ss-pawn-whole { animation: ssGone 0s linear .68s forwards; }
@keyframes ssGone { to { opacity: 0; } }
.ss-pop { opacity: 0; transform-origin: 50% 50%; animation: ssPop .3s ease-out .68s forwards; }
@keyframes ssPop { 0% { opacity: .9; transform: scale(.2); } 100% { opacity: 0; transform: scale(1.4); } }
.ss-ring { opacity: 0; transform-origin: 50% 50%; animation: ssRing .55s cubic-bezier(.1,.7,.3,1) .68s forwards; }
@keyframes ssRing { 0% { opacity: .95; transform: scale(.12); } 100% { opacity: 0; transform: scale(1); } }
.ss-spark { opacity: 0; transform-origin: 50% 50%; animation: ssSpark .5s cubic-bezier(.1,.8,.3,1) .68s forwards; }
@keyframes ssSpark { 0% { opacity: 1; transform: translate(0,0) scale(1); } 100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(.3); } }
.ss-title { margin-top: 3.4cqh; font-size: 5.6cqh; font-weight: 900; letter-spacing: -0.02em; color: #e5e5e0; opacity: 0; animation: ssUp .5s ease .8s forwards; }
.ss-title span { color: #81b64c; }
.ss-tag { margin-top: 1.6cqh; font-size: 3cqh; font-weight: 800; color: rgba(229,229,224,.78); opacity: 0; animation: ssUp .5s ease 1.05s forwards; }
.ss-tag span { color: #81b64c; }
@keyframes ssUp { 0% { opacity: 0; transform: translateY(8px); } 100% { opacity: 1; transform: translateY(0); } }
`;

type V = React.CSSProperties & Record<string, string>;
const SHARDS: [string, V][] = [
  ['ssC1', { '--dx': '-34px', '--dy': '-46px', '--r': '-160deg' }], ['ssC2', { '--dx': '38px', '--dy': '-50px', '--r': '190deg' }],
  ['ssC3', { '--dx': '-46px', '--dy': '-24px', '--r': '-110deg' }], ['ssC4', { '--dx': '50px', '--dy': '-22px', '--r': '130deg' }],
  ['ssC5', { '--dx': '-40px', '--dy': '-6px', '--r': '-70deg' }], ['ssC6', { '--dx': '42px', '--dy': '-8px', '--r': '80deg' }],
];
const SPARKS: [number, number, string, string, string][] = [
  [-6, 2.2, '#e5e5e0', '-58px', '-30px'], [-6, 1.8, '#81b64c', '56px', '-36px'], [-6, 1.6, '#e5e5e0', '-30px', '-58px'], [-6, 2, '#a3cf6f', '28px', '-60px'],
  [-4, 1.5, '#e5e5e0', '-70px', '-6px'], [-4, 1.5, '#e5e5e0', '70px', '-4px'], [-8, 1.3, '#81b64c', '-8px', '-72px'],
];

export function StudioSplash({ tagline = true }: { tagline?: boolean }) {
  return (
    <div className="absolute inset-0 z-[45] flex flex-col items-center justify-center" style={{ background: '#141413', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <style>{CSS}</style>
      <svg className="ss-stage" viewBox="0 0 240 150" xmlns="http://www.w3.org/2000/svg" aria-label="ChessScout" role="img">
        <defs>
          <linearGradient id="ssRookFill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3a3a37" /><stop offset=".55" stopColor="#181817" /><stop offset="1" stopColor="#0a0a09" /></linearGradient>
          <linearGradient id="ssPawnFill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset=".6" stopColor="#e9e8e2" /><stop offset="1" stopColor="#bdbcb4" /></linearGradient>
          <radialGradient id="ssPopFill"><stop offset="0" stopColor="#fff" stopOpacity=".95" /><stop offset=".5" stopColor="#d9f0bf" stopOpacity=".45" /><stop offset="1" stopColor="#81b64c" stopOpacity="0" /></radialGradient>
          <radialGradient id="ssGlowFill"><stop offset="0" stopColor="#81b64c" stopOpacity=".7" /><stop offset="1" stopColor="#81b64c" stopOpacity="0" /></radialGradient>
          <g id="ssPawnShape">
            <path d="M-18,0 L18,0 Q18,-8 11,-10 Q6,-14 6,-26 L10,-27 Q12,-30 9,-32 L-9,-32 Q-12,-30 -10,-27 L-6,-26 Q-6,-14 -11,-10 Q-18,-8 -18,0 Z" fill="url(#ssPawnFill)" stroke="#1a1a19" strokeWidth="1.6" strokeLinejoin="round" />
            <circle cx="0" cy="-41" r="10" fill="url(#ssPawnFill)" stroke="#1a1a19" strokeWidth="1.6" />
            <path d="M-5,-46 Q-1,-50 4,-48" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".9" />
          </g>
          <clipPath id="ssC1"><polygon points="-21,-53 2,-53 -3,-38 -21,-36" /></clipPath>
          <clipPath id="ssC2"><polygon points="2,-53 21,-53 21,-34 -3,-38" /></clipPath>
          <clipPath id="ssC3"><polygon points="-21,-36 -3,-38 0,-20 -21,-16" /></clipPath>
          <clipPath id="ssC4"><polygon points="-3,-38 21,-34 21,-14 0,-20" /></clipPath>
          <clipPath id="ssC5"><polygon points="-21,-16 0,-20 4,2 -21,2" /></clipPath>
          <clipPath id="ssC6"><polygon points="0,-20 21,-14 21,2 4,2" /></clipPath>
        </defs>
        <g className="ss-shake">
          <g className="ss-board">
            <rect x="30" y="110" width="60" height="16" fill="#2b2b28" />
            <rect x="90" y="110" width="60" height="16" fill="#e9e8e2" />
            <rect x="150" y="110" width="60" height="16" fill="#2b2b28" />
            <rect className="ss-flash" x="150" y="110" width="60" height="16" fill="#81b64c" />
            <rect x="30" y="126" width="180" height="5" rx="1.5" fill="#0c0c0b" />
            <line x1="30" y1="110.5" x2="210" y2="110.5" stroke="#e5e5e0" strokeOpacity=".12" />
          </g>
          <ellipse className="ss-glow" cx="180" cy="110" rx="46" ry="12" fill="url(#ssGlowFill)" />
          <ellipse className="ss-shadow" cx="60" cy="111" rx="24" ry="4" fill="#000" />
          <g transform="translate(180,110)">
            <g className="ss-pawn">
              {SHARDS.map(([clip, v]) => <g key={clip} className="ss-shard" clipPath={`url(#${clip})`} style={v}><use href="#ssPawnShape" /></g>)}
              <use className="ss-pawn-whole" href="#ssPawnShape" />
            </g>
            <ellipse className="ss-ring" cx="0" cy="0" rx="62" ry="13" fill="none" stroke="#81b64c" strokeWidth="2.5" />
            {SPARKS.map(([cy, r, fill, dx, dy], k) => <circle key={k} className="ss-spark" cx="0" cy={cy} r={r} fill={fill} style={{ '--dx': dx, '--dy': dy } as V} />)}
          </g>
          <g className="ss-rook-pos">
            <g className="ss-rook-body">
              <path d="M-22,0 L22,0 L22,-7 L18,-10 L18,-14 L13,-17 L12,-44 L17,-47 L17,-64 L10,-64 L10,-57 L4,-57 L4,-64 L-4,-64 L-4,-57 L-10,-57 L-10,-64 L-17,-64 L-17,-47 L-12,-44 L-13,-17 L-18,-14 L-18,-10 L-22,-7 Z"
                fill="url(#ssRookFill)" stroke="#e5e5e0" strokeWidth="2" strokeLinejoin="round" />
              <path d="M-12,-44 L12,-44 M-13,-17 L13,-17 M-18,-10 L18,-10" stroke="#e5e5e0" strokeOpacity=".28" strokeWidth="1.2" />
              <path d="M-8,-40 L-9,-21" stroke="#fff" strokeOpacity=".16" strokeWidth="2.5" strokeLinecap="round" />
            </g>
          </g>
          <circle className="ss-pop" cx="180" cy="92" r="30" fill="url(#ssPopFill)" />
        </g>
      </svg>
      <div className="ss-title">Chess<span>Scout</span>.net</div>
      {tagline && <div className="ss-tag">Play smarter. <span>Win more.</span></div>}
    </div>
  );
}
