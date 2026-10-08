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
