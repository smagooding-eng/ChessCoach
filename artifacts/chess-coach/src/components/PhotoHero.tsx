import React from 'react';
import { RD } from '@/lib/redesignTheme';
import { useSiteImg } from '@/hooks/use-app-config';

/** Decorative scene picture (AI art, or its photo twin when the admin photo toggle is on). */
export const scene = (name: string) => `${import.meta.env.BASE_URL}chessscout/scenes/${name}.webp`;

// Page header for the enhanced UI: a wide picture with the title and subtitle
// over a dark fade on the left, matching the home page's scout banner.
export function PhotoHero({
  img, title, subtitle, icon, children,
}: {
  img: string;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const siteImg = useSiteImg();
  return (
    <section
      className="relative overflow-hidden rounded-[20px]"
      style={{ background: RD.bg, border: `1px solid ${RD.border}` }}
    >
      <img src={siteImg(img)} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: '70% center' }} />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(5,10,11,.95) 0%, rgba(5,10,11,.78) 45%, rgba(5,10,11,.15) 100%), linear-gradient(0deg, rgba(5,10,11,.55) 0%, rgba(5,10,11,0) 50%)' }} />
      <div className="relative z-10 flex min-h-[150px] flex-col justify-end p-5">
        {icon && (
          <span className="mb-3 grid h-10 w-10 place-items-center rounded-[12px]" style={{ background: 'rgba(139,234,69,.14)', color: RD.green, border: '1px solid rgba(139,234,69,.25)' }}>{icon}</span>
        )}
        <h1 className="text-[26px] font-black leading-tight tracking-tight" style={{ color: RD.text, textShadow: '0 2px 14px rgba(0,0,0,.85)' }}>{title}</h1>
        {subtitle && <p className="mt-1 max-w-[70%] text-[13.5px] leading-snug" style={{ color: '#C9D1CE', textShadow: '0 2px 10px rgba(0,0,0,.9)' }}>{subtitle}</p>}
        {children}
      </div>
    </section>
  );
}
