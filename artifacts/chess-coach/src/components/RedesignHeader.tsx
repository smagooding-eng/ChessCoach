import React from 'react';
import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import { RD } from '@/lib/redesignTheme';

// Per-page header used by the redesigned screens: a green icon (or a back
// arrow), a bold title and an optional action on the right. Layout hides its
// own logo header on these screens while the redesign is on, so this also
// supplies the top safe-area spacing.
export function RedesignHeader({
  title, icon, backHref, right, dense,
}: {
  title: string;
  icon?: React.ReactNode;
  backHref?: string;
  right?: React.ReactNode;
  /** Tighter header for screens that must fit on one screen (e.g. game review) */
  dense?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 px-1 ${dense ? 'pb-1.5 pt-[max(0.25rem,env(safe-area-inset-top))]' : 'pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]'}`}>
      <div className="flex min-w-0 items-center gap-3.5">
        {backHref ? (
          <Link href={backHref} aria-label="Back" className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ color: RD.green }}>
            <ArrowLeft size={22} />
          </Link>
        ) : icon ? (
          <span className="grid h-9 w-9 shrink-0 place-items-center" style={{ color: RD.green }}>{icon}</span>
        ) : null}
        <h1 className={`truncate font-extrabold tracking-tight ${dense ? 'text-[19px]' : 'text-[22px]'}`} style={{ color: RD.text }}>{title}</h1>
      </div>
      {right && <div className="flex shrink-0 items-center gap-1" style={{ color: RD.text }}>{right}</div>}
    </div>
  );
}
