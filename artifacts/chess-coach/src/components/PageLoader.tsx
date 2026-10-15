import React from 'react';

// Loader shown while a page's code loads: a white pawn captures a black knight
// diagonally and promotes to a queen. Pure CSS/SVG (~1.3s, then a soft idle
// glow); respects reduced motion. Sister animation to the index.html splash.
const CSS = `
.pl-stage { width: min(220px, 64vw); height: auto; overflow: visible; }
.pl-stage * { transform-box: fill-box; }
.pl-fadein { animation: plFade .25s ease-out both; }
@keyframes plFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.pl-shake { animation: plShake .24s linear 0.55s 1; }
@keyframes plShake { 0%,100% { transform: translate(0,0); } 25% { transform: translate(-2.5px,1.5px); } 50% { transform: translate(2.5px,-1.5px); } 75% { transform: translate(-1px,1px); } }
.pl-flash { opacity: 0; animation: plFlash .7s ease-out 0.55s forwards; }
@keyframes plFlash { 0% { opacity: .85; } 100% { opacity: .18; } }
.pl-pawn-pos { transform: translate(63.3px,117.0px); animation: plArc 0.95s linear forwards; }
@keyframes plArc {
        0%, 22% { transform: translate(63.3px,117.0px) scale(1); }
        22.0% { transform: translate(63.3px,117.0px) scale(1.000); }
        26.5% { transform: translate(70.4px,95.6px) scale(0.988); }
        31.0% { transform: translate(77.5px,79.5px) scale(0.975); }
        35.5% { transform: translate(84.6px,68.6px) scale(0.963); }
        40.0% { transform: translate(91.7px,63.0px) scale(0.950); }
        44.5% { transform: translate(98.7px,62.6px) scale(0.938); }
        49.0% { transform: translate(105.8px,67.5px) scale(0.925); }
        53.5% { transform: translate(112.9px,77.6px) scale(0.912); }
        58.0% { transform: translate(120.0px,93.0px) scale(0.900); }
        100% { transform: translate(120.0px,93.0px) scale(.9); }
}
.pl-pawn-body { transform-origin: 50% 100%; animation: plSquash 0.95s cubic-bezier(.3,.7,.4,1) forwards; }
@keyframes plSquash {
  0%, 8% { transform: scale(1,1) rotate(0); }
  20% { transform: scale(1.12,.86); }
  27% { transform: scale(.9,1.12) rotate(6deg); }
  42% { transform: scale(1,1) rotate(-4deg); }
  58% { transform: scale(1.18,.8) rotate(0); }
  65% { transform: scale(.96,1.05); }
  70%, 100% { transform: scale(1,1); }
}
.pl-shadow { transform-origin: 50% 50%; animation: plShadow 0.95s linear forwards; }
@keyframes plShadow {
  0%, 22% { transform: translate(0,0) scale(1); opacity: .5; }
  40% { transform: translate(28.4px,-12.0px) scale(.5); opacity: .18; }
  58%, 100% { transform: translate(56.7px,-24.0px) scale(.9); opacity: .5; }
}
/* promotion: pawn flares out, queen rises out of it */
.pl-pawn-whole { transform-origin: 50% 100%; animation: plPawnOut .25s ease-in 0.67s forwards; }
@keyframes plPawnOut { 0% { opacity: 1; transform: scale(1); filter: brightness(1); } 100% { opacity: 0; transform: scale(1.25,1.1); filter: brightness(2); } }
.pl-queen { opacity: 0; transform-origin: 50% 100%; animation: plQueenIn .42s cubic-bezier(.2,1.6,.4,1) 0.71s forwards; }
@keyframes plQueenIn { 0% { opacity: 0; transform: scale(.55,.2); } 30% { opacity: 1; } 100% { opacity: 1; transform: scale(1,1); } }
.pl-beam { opacity: 0; transform-origin: 50% 100%; animation: plBeam .6s ease-out 0.65s forwards; }
@keyframes plBeam { 0% { opacity: 0; transform: scaleY(.2); } 25% { opacity: .9; transform: scaleY(1); } 100% { opacity: 0; transform: scaleY(1.1); } }
.pl-twinkle { opacity: 0; transform-origin: 50% 50%; animation: plTwinkle .5s ease-out both; }
@keyframes plTwinkle { 0% { opacity: 0; transform: scale(.2) rotate(0); } 40% { opacity: 1; transform: scale(1.1) rotate(45deg); } 100% { opacity: 0; transform: scale(.4) rotate(90deg); } }
/* knight: nervous, then shatters */
.pl-knight { transform-origin: 50% 100%; animation: plNervous .18s ease-in-out .28s 2; }
@keyframes plNervous { 0%,100% { transform: rotate(0); } 25% { transform: rotate(-5deg); } 75% { transform: rotate(5deg); } }
.pl-knight-whole { animation: plGone 0s linear 0.55s forwards; }
@keyframes plGone { to { opacity: 0; } }
.pl-shard { transform-origin: 50% 50%; animation: plShard .6s cubic-bezier(.15,.6,.35,1) 0.55s forwards; }
@keyframes plShard {
  0% { transform: translate(0,0) rotate(0); opacity: 1; }
  40% { transform: translate(calc(var(--dx) * .55), calc(var(--dy) * .7)) rotate(calc(var(--r) * .5)); opacity: 1; }
  100% { transform: translate(var(--dx), calc(var(--dy) + 14px)) rotate(var(--r)); opacity: 0; }
}
.pl-ring { opacity: 0; transform-origin: 50% 50%; animation: plRing .5s cubic-bezier(.1,.7,.3,1) 0.55s forwards; }
@keyframes plRing { 0% { opacity: .95; transform: scale(.12); } 100% { opacity: 0; transform: scale(1); } }
.pl-spark { opacity: 0; transform-origin: 50% 50%; animation: plSpark .45s cubic-bezier(.1,.8,.3,1) 0.55s forwards; }
@keyframes plSpark { 0% { opacity: 1; transform: translate(0,0) scale(1); } 100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(.3); } }
.pl-glow { opacity: 0; transform-origin: 50% 50%; animation: plGlowIn .6s ease-out 0.85s forwards, plGlow 2.4s ease-in-out 1.45s infinite; }
@keyframes plGlowIn { from { opacity: 0; transform: scale(.6); } to { opacity: .6; transform: scale(1); } }
@keyframes plGlow { 0%, 100% { opacity: .6; } 50% { opacity: .28; } }
.pl-bar-wrap { width: 140px; height: 3px; border-radius: 4px; overflow: hidden; background: rgba(129,182,76,.15); opacity: 0; animation: plFade .4s ease .35s forwards; }
.pl-bar { height: 100%; width: 30%; border-radius: 4px; background: linear-gradient(90deg, #81b64c, #a3cf6f); animation: plBar 1.4s ease-in-out infinite; }
@keyframes plBar { 0% { transform: translateX(-100%); } 100% { transform: translateX(533%); } }
@media (prefers-reduced-motion: reduce) {
  .pl-stage *, .pl-bar-wrap, .pl-fadein { animation: none !important; }
  .pl-pawn-pos { transform: translate(120.0px,93.0px) scale(.9); }
  .pl-shadow { transform: translate(56.7px,-24.0px) scale(.9); }
  .pl-knight, .pl-pawn-whole, .pl-ring, .pl-spark, .pl-beam, .pl-twinkle { display: none; }
  .pl-queen, .pl-bar-wrap { opacity: 1; }
  .pl-flash { opacity: .18; }
  .pl-glow { opacity: .45; }
}
`;

export function PageLoader() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5 bg-background" role="status" aria-label="Loading">
      <style>{CSS}</style>
      <svg className="pl-stage pl-fadein" viewBox="0 0 240 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <linearGradient id="plWhite" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" /><stop offset=".6" stopColor="#e9e8e2" /><stop offset="1" stopColor="#bdbcb4" />
          </linearGradient>
          <linearGradient id="plBlack" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#3a3a37" /><stop offset=".55" stopColor="#181817" /><stop offset="1" stopColor="#0a0a09" />
          </linearGradient>
          <radialGradient id="plGlowFill"><stop offset="0" stopColor="#81b64c" stopOpacity=".7" /><stop offset="1" stopColor="#81b64c" stopOpacity="0" /></radialGradient>
          <linearGradient id="plBeamFill" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#ffffff" stopOpacity=".95" /><stop offset=".5" stopColor="#d9f0bf" stopOpacity=".5" /><stop offset="1" stopColor="#81b64c" stopOpacity="0" />
          </linearGradient>
          <g id="plKnight">
            <path d="M-18,0 L20,0 L20,-6 L16,-9 L16,-12 L12,-13 C17,-25 19,-39 13,-49 C9,-56 2,-60 -5,-58 L-8,-65 L-11,-57 C-16,-53 -20,-47 -22,-41 L-26,-31 C-27.5,-26.5 -24,-23 -20,-25 L-14,-29 C-10,-30.5 -6,-32 -4,-34.5 C-8,-27 -12,-19 -12,-13 L-16,-12 L-16,-9 L-18,-6 Z"
              fill="url(#plBlack)" stroke="#e5e5e0" strokeWidth="1.9" strokeLinejoin="round" />
            <circle cx="-11.5" cy="-46" r="1.8" fill="#e5e5e0" />
            <path d="M11,-48 C15,-38 14,-24 10,-15" fill="none" stroke="#e5e5e0" strokeOpacity=".3" strokeWidth="1.3" strokeLinecap="round" />
            <path d="M-16,-9 L16,-9" stroke="#e5e5e0" strokeOpacity=".28" strokeWidth="1.2" />
          </g>
          <g id="plPawn">
            <path d="M-18,0 L18,0 Q18,-8 11,-10 Q6,-14 6,-26 L10,-27 Q12,-30 9,-32 L-9,-32 Q-12,-30 -10,-27 L-6,-26 Q-6,-14 -11,-10 Q-18,-8 -18,0 Z" fill="url(#plWhite)" stroke="#1a1a19" strokeWidth="1.6" strokeLinejoin="round" />
            <circle cx="0" cy="-41" r="10" fill="url(#plWhite)" stroke="#1a1a19" strokeWidth="1.6" />
            <path d="M-5,-46 Q-1,-50 4,-48" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".9" />
          </g>
            <clipPath id="plK0"><polygon points="-29,-67 0,-67 -6,-46 -29,-42" /></clipPath>
            <clipPath id="plK1"><polygon points="0,-67 23,-67 23,-40 -6,-46" /></clipPath>
            <clipPath id="plK2"><polygon points="-29,-42 -6,-46 -2,-24 -29,-20" /></clipPath>
            <clipPath id="plK3"><polygon points="-6,-46 23,-40 23,-18 -2,-24" /></clipPath>
            <clipPath id="plK4"><polygon points="-29,-20 -2,-24 3,2 -29,2" /></clipPath>
            <clipPath id="plK5"><polygon points="-2,-24 23,-18 23,2 3,2" /></clipPath>
        </defs>
        <g className="pl-shake">
          <polygon points="30,130 90,130 93.33,104 40,104" fill="#2b2b28" />
          <polygon points="40,104 93.33,104 96,82 48,82" fill="#e9e8e2" />
          <polygon points="90,130 150,130 146.67,104 93.33,104" fill="#e9e8e2" />
          <polygon points="93.33,104 146.67,104 144,82 96,82" fill="#2b2b28" />
          <polygon points="150,130 210,130 200,104 146.67,104" fill="#2b2b28" />
          <polygon points="146.67,104 200,104 192,82 144,82" fill="#e9e8e2" />
          <polygon className="pl-flash" points="93.33,104 146.67,104 144,82 96,82" fill="#81b64c" />
          <polygon points="30,130 210,130 210,135 30,135" fill="#0c0c0b" />
          <ellipse className="pl-glow" cx="120.0" cy="93.0" rx="40" ry="10" fill="url(#plGlowFill)" />
          <ellipse className="pl-shadow" cx="63.3" cy="118.0" rx="20" ry="3.6" fill="#000" />

          {/* black knight on the back rank (drawn first: it's further away) */}
          <g transform="translate(120.0,93.0) scale(.9)">
            <g className="pl-knight">
                <g className="pl-shard" clipPath="url(#plK0)" style={{ "--dx": "-30px", "--dy": "-34px", "--r": "-150deg" } as React.CSSProperties}><use href="#plKnight" /></g>
                <g className="pl-shard" clipPath="url(#plK1)" style={{ "--dx": "30px", "--dy": "-38px", "--r": "170deg" } as React.CSSProperties}><use href="#plKnight" /></g>
                <g className="pl-shard" clipPath="url(#plK2)" style={{ "--dx": "-38px", "--dy": "-14px", "--r": "-100deg" } as React.CSSProperties}><use href="#plKnight" /></g>
                <g className="pl-shard" clipPath="url(#plK3)" style={{ "--dx": "40px", "--dy": "-16px", "--r": "120deg" } as React.CSSProperties}><use href="#plKnight" /></g>
                <g className="pl-shard" clipPath="url(#plK4)" style={{ "--dx": "-32px", "--dy": "-2px", "--r": "-60deg" } as React.CSSProperties}><use href="#plKnight" /></g>
                <g className="pl-shard" clipPath="url(#plK5)" style={{ "--dx": "34px", "--dy": "-4px", "--r": "70deg" } as React.CSSProperties}><use href="#plKnight" /></g>
              <use className="pl-knight-whole" href="#plKnight" />
            </g>
            <ellipse className="pl-ring" cx="0" cy="0" rx="54" ry="11" fill="none" stroke="#81b64c" strokeWidth="2.4" />
              <circle className="pl-spark" cx="0" cy="-6" r="1.8" fill="#e5e5e0" style={{ "--dx": "-44px", "--dy": "-22px" } as React.CSSProperties} />
              <circle className="pl-spark" cx="0" cy="-6" r="1.6" fill="#81b64c" style={{ "--dx": "42px", "--dy": "-26px" } as React.CSSProperties} />
              <circle className="pl-spark" cx="0" cy="-6" r="1.4" fill="#e5e5e0" style={{ "--dx": "-20px", "--dy": "-44px" } as React.CSSProperties} />
              <circle className="pl-spark" cx="0" cy="-6" r="1.7" fill="#a3cf6f" style={{ "--dx": "22px", "--dy": "-46px" } as React.CSSProperties} />
              <circle className="pl-spark" cx="0" cy="-6" r="1.3" fill="#e5e5e0" style={{ "--dx": "-52px", "--dy": "-2px" } as React.CSSProperties} />
              <circle className="pl-spark" cx="0" cy="-6" r="1.3" fill="#e5e5e0" style={{ "--dx": "52px", "--dy": "-2px" } as React.CSSProperties} />
          </g>

          {/* white pawn -> queen */}
          <g className="pl-pawn-pos">
            <g className="pl-pawn-body">
              <rect className="pl-beam" x="-16" y="-110" width="32" height="110" rx="16" fill="url(#plBeamFill)" />
              <use className="pl-pawn-whole" href="#plPawn" />
              <g className="pl-queen">
                <path d="M-18,0 L18,0 L18,-6 L14,-9 L14,-12 L10,-15 L12,-35 L15,-50 L12,-42 L7.5,-55 L4,-45 L0,-59 L-4,-45 L-7.5,-55 L-12,-42 L-15,-50 L-12,-35 L-10,-15 L-14,-12 L-14,-9 L-18,-6 Z"
                  fill="url(#plWhite)" stroke="#1a1a19" strokeWidth="1.6" strokeLinejoin="round" />
                <path d="M-12,-35 L12,-35 M-10,-15 L10,-15 M-14,-9 L14,-9" stroke="#1a1a19" strokeOpacity=".35" strokeWidth="1.1" />
                <path d="M-6,-31 L-5,-18" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity=".9" />
                  <circle cx="-15" cy="-52.4" r="2.6" fill="url(#plWhite)" stroke="#1a1a19" strokeWidth="1.3" />
                  <circle cx="-7.5" cy="-57.4" r="2.6" fill="url(#plWhite)" stroke="#1a1a19" strokeWidth="1.3" />
                  <circle cx="0" cy="-61.4" r="2.6" fill="url(#plWhite)" stroke="#1a1a19" strokeWidth="1.3" />
                  <circle cx="7.5" cy="-57.4" r="2.6" fill="url(#plWhite)" stroke="#1a1a19" strokeWidth="1.3" />
                  <circle cx="15" cy="-52.4" r="2.6" fill="url(#plWhite)" stroke="#1a1a19" strokeWidth="1.3" />
              </g>
                <path className="pl-twinkle" style={{ animationDelay: "0.81s" }} d="M-22,-56 l1.6,4 4,1.6 -4,1.6 -1.6,4 -1.6,-4 -4,-1.6 4,-1.6 z" fill="#fff" />
                <path className="pl-twinkle" style={{ animationDelay: "0.87s" }} d="M20,-70 l1.6,4 4,1.6 -4,1.6 -1.6,4 -1.6,-4 -4,-1.6 4,-1.6 z" fill="#fff" />
                <path className="pl-twinkle" style={{ animationDelay: "0.93s" }} d="M24,-42 l1.6,4 4,1.6 -4,1.6 -1.6,4 -1.6,-4 -4,-1.6 4,-1.6 z" fill="#fff" />
            </g>
          </g>
        </g>
      </svg>
      <div className="pl-bar-wrap"><div className="pl-bar" /></div>
    </div>
  );
}
