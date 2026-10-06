import { useDashboardRedesignFlag } from '@/hooks/use-app-config';

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

export function useBotAvatar() {
  const { enabled } = useDashboardRedesignFlag();
  return (bot: { name: string; avatar: string }): string => {
    const slug = PORTRAIT[bot.name];
    return enabled && slug ? `${import.meta.env.BASE_URL}assets/bots/${slug}.webp` : bot.avatar;
  };
}
