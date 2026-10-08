import { useDashboardRedesignFlag, usePhotoImagesFlag } from '@/hooks/use-app-config';

// Illustrated bot portraits (public/assets/bots), used only while the
// redesign toggle is on. With it off, every bot keeps the avatar URL it
// already has in lib/chess-bot.ts, so nothing changes for the classic design.
const PORTRAIT: Record<string, string> = {
  Tommy: 'tommy',
  Rosa: 'rosa',
  Derek: 'derek',
  Mia: 'mia',
  Viktor: 'viktor',
  Nadia: 'nadia',
  'Grandmaster Chen': 'grandmaster-chen',
  'Dr. Fischer': 'dr-fischer',
};

// With the admin "real photos" toggle on, each bot is instead a photographed
// chess piece that climbs with its rating: white pawn (400), black pawn,
// white knight, black knight, white bishop, black bishop, black rook and the
// queen (2000). Lives at public/photo/assets/bots/<slug>.webp.
export function useBotAvatar() {
  const { enabled } = useDashboardRedesignFlag();
  const photo = usePhotoImagesFlag();
  return (bot: { name: string; avatar: string }): string => {
    const slug = PORTRAIT[bot.name];
    if (photo && slug) return `${import.meta.env.BASE_URL}photo/assets/bots/${slug}.webp`;
    return enabled && slug ? `${import.meta.env.BASE_URL}assets/bots/${slug}.webp` : bot.avatar;
  };
}

// Names to go with the photographed pieces: with the photo toggle on, a bot
// is called by its piece ("White Pawn" ... "Queen") instead of a person's
// name. The rank (Beginner ... Master) and rating still show beside it.
const PIECE_NAME: Record<string, string> = {
  Tommy: 'White Pawn',
  Rosa: 'Black Pawn',
  Derek: 'White Knight',
  Mia: 'Black Knight',
  Viktor: 'White Bishop',
  Nadia: 'Black Bishop',
  'Grandmaster Chen': 'Black Rook',
  'Dr. Fischer': 'The Queen',
};

export function useBotName() {
  const photo = usePhotoImagesFlag();
  return (bot: { name: string }): string => (photo && PIECE_NAME[bot.name]) || bot.name;
}

// Descriptions without the people in them, for the piece versions.
const PIECE_BLURB: Record<string, string> = {
  Tommy: 'Plays like someone who just learned the rules. Makes lots of random moves.',
  Rosa: 'Knows the basics but misses tactics.',
  Derek: 'Captures free pieces and fights for the center.',
  Mia: 'Solid fundamentals — rarely hangs pieces.',
  Viktor: 'Sees tactics two or three moves deep.',
  Nadia: 'Strong positional play and endgames.',
  'Grandmaster Chen': 'Deep calculation and relentless pressure.',
  'Dr. Fischer': 'Near-master strength. Punishes the slightest inaccuracy.',
};

export function useBotDescription() {
  const photo = usePhotoImagesFlag();
  return (bot: { name: string; description: string }): string => (photo && PIECE_BLURB[bot.name]) || bot.description;
}
