import React from 'react';

// Loader shown while a page's code loads: a black knight hops a closed
// knight's tour around a 3x3 board, lighting each square it lands on. It loops
// seamlessly (6s), so it looks right however long the load takes.
// Pure CSS/SVG; respects reduced motion.
const CSS = `
.pl-stage { width: min(200px, 58vw); height: auto; overflow: visible; }
.pl-stage * { transform-box: fill-box; }
.pl-in { animation: plIn .25s ease-out both; }
@keyframes plIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.pl-knight-pos { animation: plTour 6.0s linear infinite; }
@keyframes plTour {
  0.000%, 5.625% { transform: translate(63.0px,126.5px) scale(1.0); }
  6.771% { transform: translate(81.1px,103.9px) scale(0.987); }
  7.917% { transform: translate(99.1px,88.9px) scale(0.973); }
  9.062% { transform: translate(117.2px,81.5px) scale(0.960); }
  10.208% { transform: translate(135.2px,81.6px) scale(0.947); }
  11.354% { transform: translate(153.3px,89.3px) scale(0.933); }
  12.500%, 18.125% { transform: translate(171.3px,104.5px) scale(0.92); }
  19.271% { transform: translate(155.1px,82.3px) scale(0.908); }
  20.417% { transform: translate(138.8px,67.6px) scale(0.897); }
  21.562% { transform: translate(122.5px,60.5px) scale(0.885); }
  22.708% { transform: translate(106.2px,60.9px) scale(0.873); }
  23.854% { transform: translate(89.9px,68.9px) scale(0.862); }
  25.000%, 30.625% { transform: translate(73.7px,84.5px) scale(0.85); }
  31.771% { transform: translate(81.4px,72.6px) scale(0.875); }
  32.917% { transform: translate(89.1px,68.3px) scale(0.900); }
  34.062% { transform: translate(96.8px,71.5px) scale(0.925); }
  35.208% { transform: translate(104.6px,82.3px) scale(0.950); }
  36.354% { transform: translate(112.3px,100.6px) scale(0.975); }
  37.500%, 43.125% { transform: translate(120.0px,126.5px) scale(1.0); }
  44.271% { transform: translate(127.7px,100.6px) scale(0.975); }
  45.417% { transform: translate(135.4px,82.3px) scale(0.950); }
  46.562% { transform: translate(143.2px,71.5px) scale(0.925); }
  47.708% { transform: translate(150.9px,68.3px) scale(0.900); }
  48.854% { transform: translate(158.6px,72.6px) scale(0.875); }
  50.000%, 55.625% { transform: translate(166.3px,84.5px) scale(0.85); }
  56.771% { transform: translate(150.1px,68.9px) scale(0.862); }
  57.917% { transform: translate(133.8px,60.9px) scale(0.873); }
  59.063% { transform: translate(117.5px,60.5px) scale(0.885); }
  60.208% { transform: translate(101.2px,67.6px) scale(0.897); }
  61.354% { transform: translate(84.9px,82.3px) scale(0.908); }
  62.500%, 68.125% { transform: translate(68.7px,104.5px) scale(0.92); }
  69.271% { transform: translate(86.7px,89.3px) scale(0.933); }
  70.417% { transform: translate(104.8px,81.6px) scale(0.947); }
  71.562% { transform: translate(122.8px,81.5px) scale(0.960); }
  72.708% { transform: translate(140.9px,88.9px) scale(0.973); }
  73.854% { transform: translate(158.9px,103.9px) scale(0.987); }
  75.000%, 80.625% { transform: translate(177.0px,126.5px) scale(1.0); }
  81.771% { transform: translate(167.5px,100.6px) scale(0.975); }
  82.917% { transform: translate(158.0px,82.3px) scale(0.950); }
  84.062% { transform: translate(148.5px,71.5px) scale(0.925); }
  85.208% { transform: translate(139.0px,68.3px) scale(0.900); }
  86.354% { transform: translate(129.5px,72.6px) scale(0.875); }
  87.500%, 93.125% { transform: translate(120.0px,84.5px) scale(0.85); }
  94.271% { transform: translate(110.5px,72.6px) scale(0.875); }
  95.417% { transform: translate(101.0px,68.3px) scale(0.900); }
  96.562% { transform: translate(91.5px,71.5px) scale(0.925); }
  97.708% { transform: translate(82.0px,82.3px) scale(0.950); }
  98.854% { transform: translate(72.5px,100.6px) scale(0.975); }
  100% { transform: translate(63.0px,126.5px) scale(1.0); }
}
.pl-knight-body { transform-origin: 50% 100%; animation: plHop 0.75s ease-in-out infinite; }
@keyframes plHop {
  0% { transform: scale(1.12,.86); }
  14% { transform: scale(.97,1.03); }
  24%, 33% { transform: scale(1,1) rotate(0); }
  43% { transform: scale(1.1,.88) rotate(0); }
  51% { transform: scale(.9,1.12) rotate(-8deg); }
  72% { transform: scale(1,1) rotate(6deg); }
  96% { transform: scale(.94,1.07) rotate(0); }
  100% { transform: scale(1.12,.86); }
}
.pl-shadow { transform-origin: 50% 50%; animation: plShadow 6.0s linear infinite; }
@keyframes plShadow {
  0.000%, 5.625% { transform: translate(63.0px,126.5px) scale(1.0); opacity: .5; }
  9.062% { transform: translate(117.2px,115.5px) scale(.45); opacity: .15; }
  12.500%, 18.125% { transform: translate(171.3px,104.5px) scale(0.92); opacity: .5; }
  21.562% { transform: translate(122.5px,94.5px) scale(.45); opacity: .15; }
  25.000%, 30.625% { transform: translate(73.7px,84.5px) scale(0.85); opacity: .5; }
  34.062% { transform: translate(96.8px,105.5px) scale(.45); opacity: .15; }
  37.500%, 43.125% { transform: translate(120.0px,126.5px) scale(1.0); opacity: .5; }
  46.562% { transform: translate(143.2px,105.5px) scale(.45); opacity: .15; }
  50.000%, 55.625% { transform: translate(166.3px,84.5px) scale(0.85); opacity: .5; }
  59.063% { transform: translate(117.5px,94.5px) scale(.45); opacity: .15; }
  62.500%, 68.125% { transform: translate(68.7px,104.5px) scale(0.92); opacity: .5; }
  71.562% { transform: translate(122.8px,115.5px) scale(.45); opacity: .15; }
  75.000%, 80.625% { transform: translate(177.0px,126.5px) scale(1.0); opacity: .5; }
  84.062% { transform: translate(148.5px,105.5px) scale(.45); opacity: .15; }
  87.500%, 93.125% { transform: translate(120.0px,84.5px) scale(0.85); opacity: .5; }
  96.562% { transform: translate(91.5px,105.5px) scale(.45); opacity: .15; }
  100% { transform: translate(63.0px,126.5px) scale(1.0); opacity: .5; }
}
.pl-ring { opacity: 0; transform-origin: 50% 50%; animation: plRing 6.0s linear infinite; }
@keyframes plRing {
  0% { transform: translate(63.0px,126.5px) scale(1); opacity: 0; }
  12.483% { transform: translate(171.3px,104.5px) scale(.15); opacity: 0; }
  12.500% { transform: translate(171.3px,104.5px) scale(.15); opacity: .9; }
  19.167% { transform: translate(171.3px,104.5px) scale(0.92); opacity: 0; }
  24.983% { transform: translate(73.7px,84.5px) scale(.15); opacity: 0; }
  25.000% { transform: translate(73.7px,84.5px) scale(.15); opacity: .9; }
  31.667% { transform: translate(73.7px,84.5px) scale(0.85); opacity: 0; }
  37.483% { transform: translate(120.0px,126.5px) scale(.15); opacity: 0; }
  37.500% { transform: translate(120.0px,126.5px) scale(.15); opacity: .9; }
  44.167% { transform: translate(120.0px,126.5px) scale(1.0); opacity: 0; }
  49.983% { transform: translate(166.3px,84.5px) scale(.15); opacity: 0; }
  50.000% { transform: translate(166.3px,84.5px) scale(.15); opacity: .9; }
  56.667% { transform: translate(166.3px,84.5px) scale(0.85); opacity: 0; }
  62.483% { transform: translate(68.7px,104.5px) scale(.15); opacity: 0; }
  62.500% { transform: translate(68.7px,104.5px) scale(.15); opacity: .9; }
  69.167% { transform: translate(68.7px,104.5px) scale(0.92); opacity: 0; }
  74.983% { transform: translate(177.0px,126.5px) scale(.15); opacity: 0; }
  75.000% { transform: translate(177.0px,126.5px) scale(.15); opacity: .9; }
  81.667% { transform: translate(177.0px,126.5px) scale(1.0); opacity: 0; }
  87.483% { transform: translate(120.0px,84.5px) scale(.15); opacity: 0; }
  87.500% { transform: translate(120.0px,84.5px) scale(.15); opacity: .9; }
  94.167% { transform: translate(120.0px,84.5px) scale(0.85); opacity: 0; }
  99.983% { transform: translate(63.0px,126.5px) scale(.15); opacity: 0; }
  100% { transform: translate(63.0px,126.5px) scale(.15); opacity: .9; }
}
.pl-lit { opacity: 0; animation: plLit 6.0s linear infinite; }
@keyframes plLit { 0% { opacity: .85; } 25.0% { opacity: 0; } 100% { opacity: 0; } }
.pl-bar-wrap { width: 140px; height: 3px; border-radius: 4px; overflow: hidden; background: rgba(129,182,76,.15); opacity: 0; animation: plIn .4s ease .3s forwards; }
.pl-bar { height: 100%; width: 30%; border-radius: 4px; background: linear-gradient(90deg, #81b64c, #a3cf6f); animation: plBar 1.4s ease-in-out infinite; }
@keyframes plBar { 0% { transform: translateX(-100%); } 100% { transform: translateX(533%); } }
@media (prefers-reduced-motion: reduce) {
  .pl-stage *, .pl-bar-wrap, .pl-in { animation: none !important; }
  .pl-knight-pos, .pl-shadow { transform: translate(63.0px,126.5px); }
  .pl-ring, .pl-lit { display: none; }
  .pl-bar-wrap { opacity: 1; }
}
`;

export function PageLoader() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5 bg-background" role="status" aria-label="Loading">
      <style>{CSS}</style>
      <svg className="pl-stage pl-in" viewBox="0 0 240 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <linearGradient id="plBlack" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#3a3a37" /><stop offset=".55" stopColor="#181817" /><stop offset="1" stopColor="#0a0a09" />
          </linearGradient>
        </defs>
          <polygon points="30.0,136.0 90.0,136.0 93.0,113.0 39.0,113.0" fill="#2b2b28" />
          <polygon points="90.0,136.0 150.0,136.0 147.0,113.0 93.0,113.0" fill="#e9e8e2" />
          <polygon points="150.0,136.0 210.0,136.0 201.0,113.0 147.0,113.0" fill="#2b2b28" />
          <polygon points="39.0,113.0 93.0,113.0 95.7,92.0 47.0,92.0" fill="#e9e8e2" />
          <polygon points="93.0,113.0 147.0,113.0 144.3,92.0 95.7,92.0" fill="#2b2b28" />
          <polygon points="147.0,113.0 201.0,113.0 193.0,92.0 144.3,92.0" fill="#e9e8e2" />
          <polygon points="47.0,92.0 95.7,92.0 98.0,73.0 54.0,73.0" fill="#2b2b28" />
          <polygon points="95.7,92.0 144.3,92.0 142.0,73.0 98.0,73.0" fill="#e9e8e2" />
          <polygon points="144.3,92.0 193.0,92.0 186.0,73.0 142.0,73.0" fill="#2b2b28" />
          <polygon className="pl-lit" style={{ animationDelay: "-0.00s" }} points="30.0,136.0 90.0,136.0 93.0,113.0 39.0,113.0" fill="#81b64c" />
          <polygon className="pl-lit" style={{ animationDelay: "-5.25s" }} points="147.0,113.0 201.0,113.0 193.0,92.0 144.3,92.0" fill="#81b64c" />
          <polygon className="pl-lit" style={{ animationDelay: "-4.50s" }} points="47.0,92.0 95.7,92.0 98.0,73.0 54.0,73.0" fill="#81b64c" />
          <polygon className="pl-lit" style={{ animationDelay: "-3.75s" }} points="90.0,136.0 150.0,136.0 147.0,113.0 93.0,113.0" fill="#81b64c" />
          <polygon className="pl-lit" style={{ animationDelay: "-3.00s" }} points="144.3,92.0 193.0,92.0 186.0,73.0 142.0,73.0" fill="#81b64c" />
          <polygon className="pl-lit" style={{ animationDelay: "-2.25s" }} points="39.0,113.0 93.0,113.0 95.7,92.0 47.0,92.0" fill="#81b64c" />
          <polygon className="pl-lit" style={{ animationDelay: "-1.50s" }} points="150.0,136.0 210.0,136.0 201.0,113.0 147.0,113.0" fill="#81b64c" />
          <polygon className="pl-lit" style={{ animationDelay: "-0.75s" }} points="95.7,92.0 144.3,92.0 142.0,73.0 98.0,73.0" fill="#81b64c" />
        <polygon points="30,136 210,136 210,141 30,141" fill="#0c0c0b" />
        <g className="pl-ring"><ellipse cx="0" cy="0" rx="34" ry="8" fill="none" stroke="#81b64c" strokeWidth="2.2" /></g>
        <g className="pl-shadow"><ellipse cx="0" cy="0" rx="19" ry="3.6" fill="#000" /></g>
        <g className="pl-knight-pos">
          <g className="pl-knight-body">
            <g transform="scale(.82)">
              <path d="M-18,0 L20,0 L20,-6 L16,-9 L16,-12 L12,-13 C17,-25 19,-39 13,-49 C9,-56 2,-60 -5,-58 L-8,-65 L-11,-57 C-16,-53 -20,-47 -22,-41 L-26,-31 C-27.5,-26.5 -24,-23 -20,-25 L-14,-29 C-10,-30.5 -6,-32 -4,-34.5 C-8,-27 -12,-19 -12,-13 L-16,-12 L-16,-9 L-18,-6 Z"
                fill="url(#plBlack)" stroke="#e5e5e0" strokeWidth="2" strokeLinejoin="round" />
              <circle cx="-11.5" cy="-46" r="1.8" fill="#e5e5e0" />
              <path d="M11,-48 C15,-38 14,-24 10,-15" fill="none" stroke="#e5e5e0" strokeOpacity=".3" strokeWidth="1.3" strokeLinecap="round" />
              <path d="M-16,-9 L16,-9" stroke="#e5e5e0" strokeOpacity=".28" strokeWidth="1.2" />
            </g>
          </g>
        </g>
      </svg>
      <div className="pl-bar-wrap"><div className="pl-bar" /></div>
    </div>
  );
}
