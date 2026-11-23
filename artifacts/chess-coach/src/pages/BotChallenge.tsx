// Bot of the month: one practice bot, with a scouting report written from how that bot really
// plays (its settings), to study before beating it. A win this month earns the month's badge.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { BOTS, type BotConfig } from '@/lib/chess-bot';
import { apiFetch } from '@/lib/api';
import { useUser } from '@/hooks/use-user';
import { RedesignHeader } from '@/components/RedesignHeader';
import { AppIcon } from '@/components/AppIcon';

const MUTED = '#8F9997', GREEN = '#81B64C';

/** The month's bot: rotates through the club-strength bots. */
export function botOfTheMonth(d = new Date()): BotConfig {
  const pool = BOTS.filter((b) => b.rating >= 800 && b.rating <= 1800);
  return pool[(d.getFullYear() * 12 + d.getMonth()) % pool.length] ?? BOTS[0];
}

/** What the bot's own settings say about how it plays. */
function report(b: BotConfig): { title: string; text: string }[] {
  const out: { title: string; text: string }[] = [];
  if (b.blunderRate >= 0.15) out.push({ title: 'Hangs pieces', text: `About ${Math.round(b.blunderRate * 100)}% of its moves are outright blunders. Keep asking "what did that move leave loose?"` });
  else if (b.blunderRate >= 0.05) out.push({ title: 'Cracks under pressure', text: `Roughly 1 move in ${Math.round(1 / b.blunderRate)} is a real mistake. Long, tense positions give it more chances to slip.` });
  else out.push({ title: 'Solid', text: 'Rarely blunders outright. You will need a real plan, not just waiting for a gift.' });
  if (b.captureSight != null && b.captureSight < 0.95) out.push({ title: 'Misses captures', text: `It overlooks a capture on the board about ${Math.round((1 - b.captureSight) * 100)}% of the time. Leave bait only when you can afford it; take what it leaves.` });
  if (b.mateSight != null && b.mateSight < 0.95) out.push({ title: 'Misses mates', text: `It sometimes misses its own mate in one (about ${Math.round((1 - b.mateSight) * 100)}% of the time), but don't count on it.` });
  out.push({ title: 'Calculation', text: b.depth <= 2 ? 'Looks only a move or two ahead. Two-move combinations work.' : `Looks about ${b.depth} moves ahead. Combinations need to go deeper than that.` });
  return out;
}

export default function BotChallengePage() {
  const { authUser } = useUser();
  const bot = useMemo(() => botOfTheMonth(), []);
  const [me, setMe] = useState<{ wins: number; games: number } | null>(null);
  useEffect(() => { if (authUser) apiFetch(`/api/me/bot-month?bot=${encodeURIComponent(bot.name)}`, { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).then(setMe).catch(() => {}); }, [authUser, bot.name]);
  const month = new Date().toLocaleDateString(undefined, { month: 'long' });
  return (
    <div className="mx-auto w-full max-w-[600px] space-y-3 px-4 pb-28 pt-3" style={{ color: '#F5F7F6' }}>
      <RedesignHeader dense title={`${month}'s bot`} backHref="/progress" />
      <div className="flex items-center gap-3 rounded-[14px] p-4" style={{ background: 'var(--rd-card-solid, #182123)' }}>
        <img src={bot.avatar} alt="" className="h-16 w-16 rounded-full" style={{ background: '#212B2D' }} />
        <div className="min-w-0 flex-1">
          <b className="block text-[20px] font-black">{bot.name}</b>
          <span className="text-[13px]" style={{ color: MUTED }}>Rated about {bot.rating} · {bot.description}</span>
        </div>
      </div>
      <div className="rounded-[14px] p-4" style={{ background: 'var(--rd-card-solid, #182123)' }}>
        <div className="mb-2 flex items-center gap-2"><AppIcon name="lookup" size={22} /><b className="text-[15px]">Scouting report</b></div>
        {report(bot).map((r) => (
          <div key={r.title} className="border-t py-2.5 first:border-t-0" style={{ borderColor: 'rgba(255,255,255,.06)' }}>
            <b className="block text-[14px]">{r.title}</b>
            <p className="text-[13px] leading-snug" style={{ color: MUTED }}>{r.text}</p>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 rounded-[14px] p-3.5" style={{ background: 'var(--rd-card-solid, #182123)' }}>
        <AppIcon name="badge" size={34} style={{ filter: me?.wins ? undefined : 'grayscale(1) opacity(.6)' }} />
        <span className="min-w-0 flex-1 text-[13.5px]">
          <b className="block">{me?.wins ? `Beaten ${me.wins} time${me.wins === 1 ? '' : 's'} this month` : `Beat ${bot.name} in ${month}`}</b>
          <span style={{ color: MUTED }}>{me?.wins ? 'Badge earned. A new bot arrives next month.' : `Earns the ${month} badge. ${me?.games ? `${me.games} tries so far.` : ''}`}</span>
        </span>
      </div>
      <Link href={`/practice?bot=${encodeURIComponent(bot.name)}`} className="cs-cta">Play {bot.name}</Link>
    </div>
  );
}
