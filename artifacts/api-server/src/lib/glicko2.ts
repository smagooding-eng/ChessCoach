// Minimal Glicko-2 implementation. Step-per-game (treat each game as its own period).
// Reference: http://www.glicko.net/glicko/glicko2.pdf

const TAU = 0.5;
const SCALE = 173.7178;

export interface Rating {
  rating: number; // Glicko (display) rating
  rd: number;    // rating deviation
  vol: number;   // volatility
}

export const DEFAULT_RATING: Rating = { rating: 1500, rd: 350, vol: 0.06 };

function g(phi: number) { return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI)); }
function E(mu: number, mu_j: number, phi_j: number) { return 1 / (1 + Math.exp(-g(phi_j) * (mu - mu_j))); }

export function updateRating(player: Rating, opponent: Rating, score: number): Rating {
  // score: 1 win, 0 loss, 0.5 draw
  const mu = (player.rating - 1500) / SCALE;
  const phi = player.rd / SCALE;
  const mu_j = (opponent.rating - 1500) / SCALE;
  const phi_j = opponent.rd / SCALE;

  const gj = g(phi_j);
  const Ej = E(mu, mu_j, phi_j);
  const v = 1 / (gj * gj * Ej * (1 - Ej));
  const delta = v * gj * (score - Ej);

  // Volatility update (Illinois algorithm)
  const a = Math.log(player.vol * player.vol);
  const f = (x: number) => {
    const ex = Math.exp(x);
    const num = ex * (delta * delta - phi * phi - v - ex);
    const den = 2 * Math.pow(phi * phi + v + ex, 2);
    return num / den - (x - a) / (TAU * TAU);
  };
  const eps = 1e-6;
  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * TAU) < 0) k++;
    B = a - k * TAU;
  }
  let fA = f(A);
  let fB = f(B);
  let iter = 0;
  while (Math.abs(B - A) > eps && iter < 100) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) { A = B; fA = fB; }
    else { fA = fA / 2; }
    B = C; fB = fC;
    iter++;
  }
  const newVol = Math.exp(A / 2);

  const phiStar = Math.sqrt(phi * phi + newVol * newVol);
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu = mu + newPhi * newPhi * gj * (score - Ej);

  return {
    rating: Math.round((newMu * SCALE + 1500) * 100) / 100,
    rd: Math.round(newPhi * SCALE * 100) / 100,
    vol: Math.round(newVol * 100000) / 100000,
  };
}
