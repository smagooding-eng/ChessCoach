// Chess for Kids -- one world: meet the piece, then pick a level.

import { useEffect } from 'react';
import { Link, useParams, useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import { KidsShell, TopBar, Bubble, ChunkyButton, KID_FONT } from '@/components/kids/KidsChrome';
import { KidPiece, StarRow } from '@/components/kids/KidsArt';
import { findWorld, WORLDS } from '@/lib/kids/levels';
import { useKids, levelUnlocked, worldUnlocked, speak, stopSpeaking } from '@/lib/kids/progress';

export default function KidsWorld() {
  const { world: worldId } = useParams<{ world: string }>();
  const [, navigate] = useLocation();
  const { state } = useKids();
  const world = findWorld(worldId ?? '');
  const index = WORLDS.findIndex((w) => w.id === worldId);

  useEffect(() => {
    if (!world) return;
    const t = window.setTimeout(() => speak(`${world.name}! ${world.intro}`), 400);
    return () => { window.clearTimeout(t); stopSpeaking(); };
  }, [world]);

  if (!world || !worldUnlocked(state, index)) {
    return (
      <KidsShell>
        <TopBar back="/kids" />
        <p className="text-2xl font-extrabold text-center mt-10">This world is still locked!</p>
      </KidsShell>
    );
  }

  const next = world.levels.findIndex((l, i) => levelUnlocked(state, world, i) && !(state.stars[l.id] > 0));
  const playIndex = next === -1 ? 0 : next;

  return (
    <KidsShell tint={`${world.color}88`}>
      <TopBar back="/kids" />

      <div className="flex flex-col items-center mt-1">
        <motion.div animate={{ y: [0, -10, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}>
          <KidPiece type={world.piece} side="w" size={132} />
        </motion.div>
        <h1 className="text-[40px] leading-none font-extrabold text-white mt-1"
          style={{ textShadow: `0 4px 0 ${world.color}, 0 8px 16px rgba(47,34,87,0.25)`, fontFamily: KID_FONT }}>{world.name}</h1>
        <p className="text-lg font-bold mt-1" style={{ color: '#4A3A86' }}>with {world.buddy}</p>
      </div>

      <div className="mt-4">
        <Bubble who={<KidPiece type={world.piece} side="w" size={58} />} text={world.intro} />
      </div>

      {/* level coins, zig-zag */}
      <div className="mt-6 flex flex-col items-center gap-3">
        {world.levels.map((l, i) => {
          const open = levelUnlocked(state, world, i);
          const stars = state.stars[l.id] ?? 0;
          const isNext = i === next;
          const offset = [0, 70, 0, -70][i % 4];
          const coin = (
            <motion.div className="flex flex-col items-center gap-1" style={{ position: 'relative', left: offset }}
              initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: i * 0.06, type: 'spring', stiffness: 300, damping: 18 }}>
              <motion.div
                className="relative w-[84px] h-[84px] rounded-full flex items-center justify-center text-[38px] font-extrabold"
                style={{
                  background: !open ? '#E4DEF3' : stars ? 'linear-gradient(160deg,#FFE27A,#FFC93C)' : `linear-gradient(160deg,#ffffff,${world.color}55)`,
                  color: !open ? '#A99FC8' : stars ? '#9A5B00' : '#4A3A86',
                  boxShadow: !open ? '0 6px 0 #C9C0E3' : stars ? '0 6px 0 #E08A00' : `0 6px 0 ${world.color}`,
                  border: '4px solid #fff',
                }}
                animate={isNext ? { scale: [1, 1.07, 1] } : {}} transition={{ duration: 1.2, repeat: Infinity }}
                whileTap={open ? { y: 4 } : undefined}>
                {open ? i + 1 : <Lock className="w-8 h-8" />}
                {isNext && (
                  <span className="absolute -inset-2 rounded-full" style={{ border: `4px dashed ${world.color}` }} />
                )}
              </motion.div>
              <StarRow n={stars} size={20} />
              <span className="text-sm font-extrabold" style={{ color: '#4A3A86' }}>{l.title}</span>
            </motion.div>
          );
          return open
            ? <Link key={l.id} href={`/kids/${world.id}/${l.id}`} aria-label={`Level ${i + 1}: ${l.title}, ${stars} stars`}>{coin}</Link>
            : <div key={l.id} aria-label={`Level ${i + 1}, locked`}>{coin}</div>;
        })}
      </div>

      <div className="mt-8 flex justify-center">
        <ChunkyButton className="min-w-[220px] text-2xl" color="#5CCB86" shade="#35A060"
          onClick={() => navigate(`/kids/${world.id}/${world.levels[playIndex].id}`)}>
          {next === -1 ? 'Play again' : next === 0 ? "Let's play!" : 'Keep going!'}
        </ChunkyButton>
      </div>
    </KidsShell>
  );
}
