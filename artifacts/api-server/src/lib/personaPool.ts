// Deterministic pool of bot personas. Generated once at module load.
// Personas are presented as ordinary human users — no "bot" tells.

const FIRST_PARTS = [
  'knight','rook','pawn','queen','bishop','king','tactical','silent','swift','wandering',
  'shadow','iron','golden','smooth','quick','clever','blue','red','green','steady',
  'mighty','wise','cool','sharp','rapid','epic','noble','ace','wild','nomad',
];
const LAST_PARTS = [
  'fox','wolf','tiger','eagle','bear','hawk','panda','lion','viper','raven',
  'jaguar','dragon','falcon','otter','badger','rhino','cobra','lynx','swan','crane',
  'owl','heron','ibis','mantis','sparrow','ferret','marten','heron','ibex','oryx',
];
const SUFFIXES = ['', '', '', '', '_', '99', '21', '07', '88', '64', 'X', 'Z'];

const COUNTRIES = [
  'US','CA','GB','DE','FR','IT','ES','NL','BR','AR','MX','PL','RU','UA','TR','IN','PH',
  'AU','NZ','ZA','SE','NO','DK','FI','PT','GR','JP','KR','VN','CL','CO','PE','RO','HU','CZ','BE','IE','CH',
];

const TITLES = [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 'NM', 'CM', 'FM', 'IM']; // bias toward untitled

const AVATARS = [
  '/avatars/tommy.svg','/avatars/rosa.svg','/avatars/derek.svg','/avatars/mia.svg',
  '/avatars/viktor.svg','/avatars/nadia.svg','/avatars/chen.svg','/avatars/fischer.svg',
];

export interface Persona {
  id: string;            // stable id, e.g. "p_42"
  username: string;
  country: string;
  title: string | null;
  avatar: string;
  memberSinceYear: number;
  rating: number;        // baseline rating used for matchmaking; engine uses this
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: T[]): T { return arr[Math.floor(rng() * arr.length)]; }
function ucFirst(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

const POOL: Persona[] = [];

function buildPool() {
  const rng = mulberry32(0xC0DECAFE);
  const used = new Set<string>();
  for (let i = 0; i < 240; i++) {
    let username = '';
    let attempts = 0;
    do {
      const a = pick(rng, FIRST_PARTS);
      const b = pick(rng, LAST_PARTS);
      const s = pick(rng, SUFFIXES);
      const styleRoll = rng();
      if (styleRoll < 0.4) username = `${ucFirst(a)}${ucFirst(b)}${s}`;
      else if (styleRoll < 0.7) username = `${a}_${b}${s}`;
      else username = `${a}${b}${s}`;
      attempts++;
    } while (used.has(username.toLowerCase()) && attempts < 6);
    used.add(username.toLowerCase());

    // Rating distribution roughly normal centered at 1300, clipped 600..2200
    let r = 1300 + (rng() + rng() + rng() - 1.5) * 380;
    if (r < 600) r = 600;
    if (r > 2200) r = 2200;
    const rating = Math.round(r);

    POOL.push({
      id: `p_${i}`,
      username,
      country: pick(rng, COUNTRIES),
      title: pick(rng, TITLES),
      avatar: AVATARS[i % AVATARS.length],
      memberSinceYear: 2014 + Math.floor(rng() * 11),
      rating,
    });
  }
}

buildPool();

export function findPersonaForRating(targetRating: number, exclude: Set<string> = new Set()): Persona {
  const candidates = POOL.filter(p => !exclude.has(p.id) && Math.abs(p.rating - targetRating) <= 250);
  const fallback = POOL.filter(p => !exclude.has(p.id));
  const list = candidates.length > 0 ? candidates : (fallback.length > 0 ? fallback : POOL);
  return list[Math.floor(Math.random() * list.length)];
}

export function getPersona(id: string): Persona | undefined {
  return POOL.find(p => p.id === id);
}
