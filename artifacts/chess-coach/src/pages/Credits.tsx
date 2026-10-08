import { useEffect } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Camera, ExternalLink } from 'lucide-react';
import { setPageMeta } from '@/lib/pageMeta';
import { useDashboardRedesignFlag } from '@/hooks/use-app-config';
import { RD } from '@/lib/redesignTheme';

// Photographers whose Unsplash photos are used when the admin "real photos"
// image toggle is on. Each name links to that person's Unsplash profile.
// (One profile couldn't be confirmed, so it links to the photo page itself,
// which shows the photographer and their profile.)
const PHOTOGRAPHERS: { name: string; url: string }[] = [
  { name: 'Adlan', url: 'https://unsplash.com/@adlan7000' },
  { name: 'Ahmad Matar', url: 'https://unsplash.com/@ahmadmatar_' },
  { name: 'Alexis Fauvet', url: 'https://unsplash.com/@childeye' },
  { name: 'Anh Tuan Thomas', url: 'https://unsplash.com/photos/sf5slZKhBf0' },
  { name: 'Buddika Gunathilaka', url: 'https://unsplash.com/@unflashbuddika' },
  { name: 'Carlos Esteves', url: 'https://unsplash.com/@dimage_carlos' },
  { name: 'Charles Shaffer', url: 'https://unsplash.com/@charlesshaffer17' },
  { name: 'Charlie Solorzano', url: 'https://unsplash.com/@csolorzanoe' },
  { name: 'Christopher John', url: 'https://unsplash.com/@obichris' },
  { name: 'Connell Shandler', url: 'https://unsplash.com/@connellshandler' },
  { name: 'Daniele Franchi', url: 'https://unsplash.com/@daniele_franchi' },
  { name: 'Davidson Luna', url: 'https://unsplash.com/@davidsonluna' },
  { name: 'Dimitris Lamproulis', url: 'https://unsplash.com/@dimos79' },
  { name: 'Edoardo Bortoli', url: 'https://unsplash.com/@edo_bor' },
  { name: 'Fatima Shahid', url: 'https://unsplash.com/@fatima_shahid' },
  { name: 'Fatimah Amelia', url: 'https://unsplash.com/@fatimahamelia23' },
  { name: 'Giuseppe De Vita', url: 'https://unsplash.com/@giuseppe798' },
  { name: 'Gunjan Patel', url: 'https://unsplash.com/@gunjan195' },
  { name: 'Haroon Ameer', url: 'https://unsplash.com/@haroon_a' },
  { name: 'Hassan Pasha', url: 'https://unsplash.com/@hpzworkz' },
  { name: 'Jáchym Michal', url: 'https://unsplash.com/@jachymmichal' },
  { name: 'James Handley', url: 'https://unsplash.com/@eutony' },
  { name: 'Javier Ezpeleta', url: 'https://unsplash.com/@javierezpeleta' },
  { name: 'Javier Ortiz', url: 'https://unsplash.com/@ejavierph' },
  { name: 'Jeet Dhanoa', url: 'https://unsplash.com/@jeetdhanoa' },
  { name: 'Jon Tyson', url: 'https://unsplash.com/@jontyson' },
  { name: 'Josué Soto', url: 'https://unsplash.com/@josusotz' },
  { name: 'Judah Wester', url: 'https://unsplash.com/@judahwester' },
  { name: 'Le Vu', url: 'https://unsplash.com/@xiaowuuuuuuu' },
  { name: 'Manas RB', url: 'https://unsplash.com/@manas_rb' },
  { name: 'Nasim Keshmiri', url: 'https://unsplash.com/@nasimkeshmiri' },
  { name: 'Nathan Bailly', url: 'https://unsplash.com/@nbailly' },
  { name: 'Omar Lopez-Rincon', url: 'https://unsplash.com/@procopiopi' },
  { name: 'Osama Madlom', url: 'https://unsplash.com/@skyinferno' },
  { name: 'Pranjall Kumar', url: 'https://unsplash.com/@pranjallk1995' },
  { name: 'Rahul Pabolu', url: 'https://unsplash.com/@rahul_pabolu' },
  { name: 'Randy Fath', url: 'https://unsplash.com/@randyfath' },
  { name: 'Sasun Bughdaryan', url: 'https://unsplash.com/@sasun1990' },
  { name: 'Srinivas Bandari', url: 'https://unsplash.com/@srini2srinivas' },
  { name: 'Thomas Lai', url: 'https://unsplash.com/@thomasion' },
  { name: 'Warren Umoh', url: 'https://unsplash.com/@warrenumoh' },
  { name: 'Wim van ’t Einde', url: 'https://unsplash.com/@wimvanteinde' },
  { name: 'Yagnik Sankhedawala', url: 'https://unsplash.com/@yagniksankhedawala' },
  { name: 'Yuvraj Singh Parmar', url: 'https://unsplash.com/@ysp_19' },
];

export default function CreditsPage() {
  const { enabled: redesign } = useDashboardRedesignFlag();
  const c = redesign
    ? { bg: RD.bg, card: RD.card, border: RD.border, text: RD.text, muted: RD.muted, accent: RD.green }
    : { bg: '#262421', card: '#302e2b', border: 'rgba(255,255,255,0.08)', text: '#e8e6e3', muted: '#9e9b98', accent: '#81b64c' };

  useEffect(() => {
    setPageMeta('Photo Credits — ChessScout.net', 'The photographers whose work appears on ChessScout.net.', '/credits');
  }, []);

  return (
    <div className="min-h-screen" style={{ background: c.bg, color: c.text }}>
      <nav className="sticky top-0 z-40 backdrop-blur-xl" style={{ background: `${c.bg}dd`, borderBottom: `1px solid ${c.border}` }}>
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-8">
          <button onClick={() => (window.history.length > 1 ? window.history.back() : (window.location.href = '/'))}
            className="flex items-center gap-1.5 text-sm font-medium" style={{ color: c.muted }}>
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <Link href="/" className="flex items-center gap-0.5">
            <span className="text-lg font-black" style={{ color: c.text }}>Chess</span>
            <span className="text-lg font-black" style={{ color: c.accent }}>Scout</span>
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:px-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: c.card, border: `1px solid ${c.border}` }}>
            <Camera className="h-5 w-5" style={{ color: c.accent }} />
          </span>
          <div>
            <h1 className="text-2xl font-black">Photo Credits</h1>
            <p className="text-sm" style={{ color: c.muted }}>
              Photography by these artists on{' '}
              <a href="https://unsplash.com" target="_blank" rel="noopener noreferrer" className="underline">Unsplash</a>. Thank you.
            </p>
          </div>
        </div>

        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PHOTOGRAPHERS.map((p) => (
            <li key={p.url}>
              <a href={p.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-between rounded-xl px-4 py-3 text-[15px] font-semibold transition-opacity hover:opacity-80"
                style={{ background: c.card, border: `1px solid ${c.border}`, color: c.text }}>
                {p.name}
                <ExternalLink className="h-4 w-4 shrink-0" style={{ color: c.muted }} />
              </a>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
