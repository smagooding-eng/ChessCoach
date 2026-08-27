import { type ReactNode, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const CHESSCOM_GREEN = '#81b64c';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'warning';
type ButtonSize = 'sm' | 'md' | 'lg';

interface AppButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  fullWidth?: boolean;
}

const VARIANT_STYLES: Record<ButtonVariant, { background: string; color: string; boxShadow: string }> = {
  primary: {
    background: `linear-gradient(180deg, #a8d876 0%, ${CHESSCOM_GREEN} 55%, #5f8f36 100%)`,
    color: '#fff',
    boxShadow: '0 3px 0 #4a7028, 0 6px 12px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.25)',
  },
  secondary: {
    background: 'linear-gradient(180deg, #4a4844 0%, #3a3835 100%)',
    color: '#fff',
    boxShadow: '0 3px 0 #1f1e1c, 0 6px 12px rgba(0,0,0,0.3)',
  },
  danger: {
    background: 'linear-gradient(180deg, #e05a5a 0%, #c93535 55%, #a02828 100%)',
    color: '#fff',
    boxShadow: '0 3px 0 #7a1f1f, 0 6px 12px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.25)',
  },
  warning: {
    background: 'linear-gradient(180deg, #fbbf46 0%, #f59e0b 55%, #c9800a 100%)',
    color: '#000',
    boxShadow: '0 3px 0 #92620a, 0 6px 12px rgba(0,0,0,0.3)',
  },
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-lg',
  md: 'px-4 py-2.5 text-sm rounded-xl',
  lg: 'px-6 py-3.5 text-base rounded-xl',
};

// The one, standard, bold button style for the whole app -- solid
// gradient fill, real drop shadow, press animation. Never a faint
// translucent tint or a bare outline. Use this instead of writing new
// ad-hoc button styling anywhere.
export function AppButton({ variant = 'primary', size = 'md', children, fullWidth, className, disabled, ...rest }: AppButtonProps) {
  const style = VARIANT_STYLES[variant];
  return (
    <button
      className={cn(
        'flex items-center justify-center gap-2 font-black transition-transform active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100',
        SIZE_STYLES[size],
        fullWidth && 'w-full',
        className,
      )}
      style={{ background: style.background, color: style.color, boxShadow: style.boxShadow, border: '1px solid rgba(0,0,0,0.25)' }}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
}

// A muted, non-primary button for things like "Switch" or "Cancel" --
// still a real solid fill (not a translucent tint), just visually
// quieter than the colored variants above.
export function AppButtonGhost({ children, fullWidth, className, disabled, size = 'md', ...rest }: Omit<AppButtonProps, 'variant'>) {
  return (
    <button
      className={cn(
        'flex items-center justify-center gap-2 font-bold transition-transform active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed',
        SIZE_STYLES[size],
        fullWidth && 'w-full',
        className,
      )}
      style={{ background: 'rgba(255,255,255,0.1)', color: '#e8e6e3', border: '1px solid rgba(255,255,255,0.15)' }}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
}

// A solid, high-contrast badge/pill -- for status tags, difficulty
// labels, counts, etc. Never translucent.
type BadgeTone = 'green' | 'amber' | 'red' | 'blue' | 'neutral';
const BADGE_TONES: Record<BadgeTone, { background: string; color: string }> = {
  green:   { background: '#5f8f36', color: '#fff' },
  amber:   { background: '#c9800a', color: '#fff' },
  red:     { background: '#a02828', color: '#fff' },
  blue:    { background: '#2563eb', color: '#fff' },
  neutral: { background: '#4a4844', color: '#fff' },
};

export function AppBadge({ tone = 'neutral', children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  const t = BADGE_TONES[tone];
  return (
    <span
      className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold', className)}
      style={{ background: t.background, color: t.color }}
    >
      {children}
    </span>
  );
}
