import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export type AICoachTone = 'neutral' | 'positive' | 'warning' | 'danger' | 'info' | 'gold';

const TONE_STYLES: Record<AICoachTone, {
  ring: string;
  glow: string;
  badgeBg: string;
  badgeText: string;
  avatarRing: string;
  avatarGrad: string;
  topAccent: string;
}> = {
  neutral: {
    ring: 'border-white/10',
    glow: 'from-primary/15 via-transparent to-transparent',
    badgeBg: 'bg-primary',
    badgeText: 'text-primary-foreground',
    avatarRing: 'ring-primary/40',
    avatarGrad: 'from-primary/30 to-primary/5',
    topAccent: 'from-primary/40 via-primary/10 to-transparent',
  },
  positive: {
    ring: 'border-emerald-500/25',
    glow: 'from-emerald-500/20 via-transparent to-transparent',
    badgeBg: 'bg-emerald-500/15',
    badgeText: 'text-emerald-400',
    avatarRing: 'ring-emerald-500/40',
    avatarGrad: 'from-emerald-500/30 to-emerald-500/5',
    topAccent: 'from-emerald-400/50 via-emerald-400/10 to-transparent',
  },
  warning: {
    ring: 'border-amber-500/25',
    glow: 'from-amber-500/20 via-transparent to-transparent',
    badgeBg: 'bg-amber-500/15',
    badgeText: 'text-amber-400',
    avatarRing: 'ring-amber-500/40',
    avatarGrad: 'from-amber-500/30 to-amber-500/5',
    topAccent: 'from-amber-400/50 via-amber-400/10 to-transparent',
  },
  danger: {
    ring: 'border-red-500/25',
    glow: 'from-red-500/20 via-transparent to-transparent',
    badgeBg: 'bg-red-500/15',
    badgeText: 'text-red-400',
    avatarRing: 'ring-red-500/40',
    avatarGrad: 'from-red-500/30 to-red-500/5',
    topAccent: 'from-red-400/50 via-red-400/10 to-transparent',
  },
  info: {
    ring: 'border-cyan-500/25',
    glow: 'from-cyan-500/20 via-transparent to-transparent',
    badgeBg: 'bg-cyan-500/15',
    badgeText: 'text-cyan-400',
    avatarRing: 'ring-cyan-500/40',
    avatarGrad: 'from-cyan-500/30 to-cyan-500/5',
    topAccent: 'from-cyan-400/50 via-cyan-400/10 to-transparent',
  },
  gold: {
    ring: 'border-amber-400/30',
    glow: 'from-amber-400/20 via-transparent to-transparent',
    badgeBg: 'bg-amber-400/15',
    badgeText: 'text-amber-300',
    avatarRing: 'ring-amber-400/50',
    avatarGrad: 'from-amber-400/40 to-amber-400/5',
    topAccent: 'from-amber-300/60 via-amber-300/10 to-transparent',
  },
};

type Props = {
  tone?: AICoachTone;
  name?: string;
  badge?: string;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  thinking?: boolean;
  /** Show the speech-bubble tail pointing left from the avatar. */
  withTail?: boolean;
  /** Compact spacing for inline use. */
  compact?: boolean;
};

export function AICoachCard({
  tone = 'neutral',
  name = 'Coach',
  badge = 'Coach',
  title,
  children,
  className,
  thinking = false,
  withTail = true,
  compact = false,
}: Props) {
  const t = TONE_STYLES[tone];
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 220, damping: 22 }}
      className={cn(
        'relative rounded-[1.75rem] border bg-card/70 backdrop-blur-sm overflow-hidden shadow-lg shadow-black/20',
        t.ring,
        className,
      )}
    >
      {/* top sheen accent */}
      <div className={cn('absolute inset-x-0 top-0 h-px bg-gradient-to-r', t.topAccent)} />
      {/* corner glow */}
      <div className={cn('pointer-events-none absolute -top-12 -right-12 w-44 h-44 rounded-full blur-3xl bg-gradient-to-br', t.glow)} />

      <div className={cn('relative flex gap-3', compact ? 'p-3' : 'p-4 sm:p-5')}>
        {/* Avatar */}
        <div className="shrink-0 relative">
          <div className={cn(
            'relative w-10 h-10 rounded-full ring-2 flex items-center justify-center bg-gradient-to-br shadow-md',
            t.avatarRing,
            t.avatarGrad,
          )}>
            <CoachAvatar />
            {thinking && (
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-primary border-2 border-card" />
              </span>
            )}
            {!thinking && (
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-card" />
            )}
          </div>
          {withTail && (
            <span
              aria-hidden
              className={cn(
                'hidden sm:block absolute top-4 -right-1.5 w-3 h-3 rotate-45 border-l border-t bg-card/70',
                t.ring,
              )}
            />
          )}
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-sm font-bold text-foreground">{name}</span>
            <span className={cn(
              'text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-xl',
              t.badgeBg, t.badgeText,
            )}>
              {badge}
            </span>
            {title && (
              <span className="text-xs text-muted-foreground truncate">{title}</span>
            )}
          </div>

          {thinking ? (
            <div className="flex items-center gap-1 py-1.5">
              <ThinkingDot delay={0} />
              <ThinkingDot delay={0.15} />
              <ThinkingDot delay={0.3} />
            </div>
          ) : (
            <div className="text-sm text-foreground/85 leading-relaxed space-y-2 max-h-[28dvh] xl:max-h-none overflow-y-auto hide-scrollbar pr-1">
              {children}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function ThinkingDot({ delay }: { delay: number }) {
  return (
    <motion.span
      className="block w-1.5 h-1.5 rounded-full bg-primary/70"
      animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
      transition={{ duration: 0.9, repeat: Infinity, delay }}
    />
  );
}

function CoachAvatar() {
  // Stylized chess knight + spark — distinctive to ChessScout.net coach.
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 text-foreground/95" fill="none">
      <defs>
        <linearGradient id="coach-knight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.7" />
        </linearGradient>
      </defs>
      <path
        d="M8 19h9v-1.2c0-.4-.2-.8-.6-1l-.9-.5c-.4-.3-.7-.7-.7-1.2v-1c0-1.4.6-2.7 1.5-3.7L18 8.5c.6-.7.9-1.6.7-2.5-.3-1.6-1.7-2.7-3.3-2.6-2.3.1-4.4 1.6-5.4 3.6l-.9 1.7c-.2.5-.7.8-1.3.8H7c-.6 0-1 .4-1 1v.5c0 .8.4 1.5 1 2l.6.4c.4.3.6.8.4 1.3l-.5 1c-.2.5-.6.8-1 .9l-1.1.3c-.5.1-.9.5-.9 1.1v.5c0 .8.6 1.4 1.4 1.4H8z"
        fill="url(#coach-knight)"
      />
      <circle cx="14.5" cy="7.5" r="0.7" fill="#f3f4f6" />
    </svg>
  );
}

export default AICoachCard;
