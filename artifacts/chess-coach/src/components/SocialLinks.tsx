// Links to ChessScout's social accounts (Instagram, Facebook, TikTok) (landing footer, Settings, Profile).
// An empty URL hides that link.

export const INSTAGRAM_URL = 'https://www.instagram.com/chessscout.net3/';
export const FACEBOOK_URL = 'https://www.facebook.com/share/1Bijvk7xjg/';
export const TIKTOK_URL = 'https://www.tiktok.com/@chessscout.net3';

const SOCIALS = [
  {
    name: 'Instagram', url: INSTAGRAM_URL,
    path: '',
  },
  {
    name: 'Facebook', url: FACEBOOK_URL,
    path: 'M22 12a10 10 0 10-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.3v7A10 10 0 0022 12z',
  },
  {
    name: 'TikTok', url: TIKTOK_URL,
    path: 'M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z',
  },
].filter((s) => s.url);

export const SOCIAL_URLS = SOCIALS.map((s) => s.url);

/** Small icon links. `label` shows "Follow us" before them. */
export function SocialLinks({ size = 16, className = '', color, label }: { size?: number; className?: string; color?: string; label?: string }) {
  if (!SOCIALS.length) return null;
  return (
    <span className={`inline-flex items-center gap-2 align-middle ${className}`}>
      {label && <span>{label}</span>}
      {SOCIALS.map((s) => (
        <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer" aria-label={`ChessScout on ${s.name}`} title={`ChessScout on ${s.name}`}
          className="inline-flex rounded-md p-1 transition-opacity hover:opacity-80" style={color ? { color } : undefined}>
          {s.name === 'Instagram' ? (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.3" cy="6.7" r="1.1" fill="currentColor" stroke="none" />
            </svg>
          ) : (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={s.path} /></svg>
          )}
        </a>
      ))}
    </span>
  );
}
