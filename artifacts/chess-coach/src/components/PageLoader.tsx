import React from 'react';

// Loader shown while a page's code loads. Page loads are usually a few
// hundred ms, so this is built to read at a glance:
//   - nothing for the first 120ms (fast loads don't flash anything)
//   - a thin green progress bar across the top that shoots to ~70% in
//     0.45s, then creeps until the page is ready
//   - one small black rook that does a single quick hop with a landing ripple
//     (~0.35s), then breathes gently if the load runs long
// Pure CSS/SVG; respects reduced motion.
const CSS = `
.pl-root { animation: plShow .15s ease-out .12s both; }
@keyframes plShow { from { opacity: 0; } to { opacity: 1; } }
.pl-top { position: fixed; left: 0; top: 0; height: 3px; width: 100%; z-index: 60; pointer-events: none; }
.pl-top-bar { height: 100%; width: 100%; transform-origin: 0 50%; background: linear-gradient(90deg, #5f8f35, #81b64c 60%, #b5dc85);
  box-shadow: 0 0 10px rgba(129,182,76,.7), 0 0 3px rgba(129,182,76,.9);
  animation: plGrow .45s cubic-bezier(.2,.8,.3,1) .12s both, plCrawl 8s cubic-bezier(.1,.6,.2,1) .57s forwards; }
@keyframes plGrow { from { transform: scaleX(0); } to { transform: scaleX(.7); } }
@keyframes plCrawl { from { transform: scaleX(.7); } to { transform: scaleX(.96); } }
.pl-piece { width: 64px; height: 64px; overflow: visible; }
.pl-piece * { transform-box: fill-box; }
.pl-hop { transform-origin: 50% 100%; animation: plHop .36s cubic-bezier(.3,.7,.4,1) .12s both, plBreathe 1.8s ease-in-out .7s infinite; }
@keyframes plHop {
  0% { transform: translate(-14px, 0) scale(1.1,.88); }
  25% { transform: translate(-8px, -14px) scale(.92,1.1) rotate(-8deg); }
  60% { transform: translate(0, -6px) scale(1,1) rotate(4deg); }
  80% { transform: translate(0, 0) scale(1.14,.84) rotate(0); }
  100% { transform: translate(0, 0) scale(1,1); }
}
@keyframes plBreathe { 0%, 100% { transform: scale(1,1); } 50% { transform: scale(1.02,.98); } }
.pl-ring { opacity: 0; transform-origin: 50% 50%; animation: plRing .45s cubic-bezier(.1,.7,.3,1) .41s forwards; }
@keyframes plRing { 0% { opacity: .9; transform: scale(.2); } 100% { opacity: 0; transform: scale(1); } }
.pl-shadow { transform-origin: 50% 50%; animation: plShadow .36s ease-out .12s both; }
@keyframes plShadow { 0% { transform: translateX(-14px) scale(1); opacity: .5; } 30% { transform: translateX(-8px) scale(.55); opacity: .2; } 80%, 100% { transform: none; opacity: .5; } }
@media (prefers-reduced-motion: reduce) {
  .pl-root, .pl-top-bar, .pl-hop, .pl-ring, .pl-shadow { animation: none !important; }
  .pl-top-bar { transform: scaleX(.7); }
}
`;

export function PageLoader() {
  return (
    <div className="pl-root min-h-screen flex items-center justify-center bg-background" role="status" aria-label="Loading">
      <style>{CSS}</style>
      <div className="pl-top"><div className="pl-top-bar" /></div>
      <svg className="pl-piece" viewBox="-34 -72 68 82" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <linearGradient id="plBlack" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#3a3a37" /><stop offset=".55" stopColor="#181817" /><stop offset="1" stopColor="#0a0a09" />
          </linearGradient>
        </defs>
        <ellipse className="pl-shadow" cx="0" cy="2" rx="23" ry="3.8" fill="#000" />
        <ellipse className="pl-ring" cx="0" cy="2" rx="30" ry="6" fill="none" stroke="#81b64c" strokeWidth="2" />
        <g className="pl-hop">
          <path d="M-22,0 L22,0 L22,-7 L18,-10 L18,-14 L13,-17 L12,-44 L17,-47 L17,-64 L10,-64 L10,-57 L4,-57 L4,-64 L-4,-64 L-4,-57 L-10,-57 L-10,-64 L-17,-64 L-17,-47 L-12,-44 L-13,-17 L-18,-14 L-18,-10 L-22,-7 Z"
            fill="url(#plBlack)" stroke="#e5e5e0" strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M-12,-44 L12,-44 M-13,-17 L13,-17 M-18,-10 L18,-10" stroke="#e5e5e0" strokeOpacity=".28" strokeWidth="1.2" />
          <path d="M-8,-40 L-9,-21" stroke="#fff" strokeOpacity=".16" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
}
