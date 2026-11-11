// A one-time welcome for players signed up to a tournament that starts soon:
// the group's name and logo, when it starts, what to set up before it begins
// (board and pieces, sounds, gameplay, notifications, language), and a thank-you.
// Everyone in the same tournament sees the same welcome. Spanish or English
// (Spanish first for Spanish speakers, with a switch). Shown once per tournament.
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { X, Palette, Volume2, Settings2, Bell, Languages, Swords, Trophy } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useUser } from '@/context/UserContext';
import { getLang, setLang } from '@/lib/i18n';
import { usePushNotifications } from '@/hooks/use-push-notifications';

interface T { id: number; name: string; startsAt: string; joined: boolean; clubName: string | null; logoUrl: string | null; timeControlLabel?: string; format?: string }

const G = '#81B64C';
const SEEN = (id: number) => `cs_tournament_welcome_${id}`;
// The first official tournament on ChessScout.net.
const isFirstOfficial = (t: T) => /anpasa|andamios/i.test(`${t.name} ${t.clubName ?? ''}`);

const TXT = {
  es: {
    welcome: (g: string) => `¡Bienvenidos, ${g}!`,
    thanks: 'Gracias por ser el primer torneo oficial en ChessScout.net. Es un honor tenerlos aquí. 🏆',
    thanksOther: 'Gracias por jugar su torneo en ChessScout.net. 🏆',
    starts: 'Empieza',
    before: 'Antes de que empiece, prepara tu tablero:',
    items: [
      { icon: Palette, title: 'Tablero y piezas', text: 'Elige los colores del tablero y el estilo de las piezas que más te gusten.', to: '/settings' },
      { icon: Settings2, title: 'Cómo se juega', text: 'Confirmar jugadas, coordenadas, puntos de jugadas legales y elegir pieza al coronar.', to: '/settings' },
      { icon: Volume2, title: 'Sonidos', text: 'Escoge un paquete de sonidos, o apágalos, y la vibración en el teléfono.', to: '/settings' },
      { icon: Swords, title: 'Calienta', text: 'Juega una partida contra un bot o resuelve unos problemas antes de empezar.', to: '/practice' },
    ],
    notify: 'Activar avisos', notifyText: 'Te avisamos cuando empiece tu partida.', notifyOn: 'Avisos activados ✓',
    lang: 'Usar ChessScout en español', langText: 'Toda la app en español.',
    settings: 'Ir a ajustes', tournament: 'Ver el torneo', later: 'Ahora no',
    luck: '¡Mucha suerte!',
  },
  en: {
    welcome: (g: string) => `Welcome, ${g}!`,
    thanks: "Thank you for being the first official tournament on ChessScout.net. We're honoured to have you. 🏆",
    thanksOther: 'Thank you for playing your tournament on ChessScout.net. 🏆',
    starts: 'Starts',
    before: 'Before it starts, set up your board:',
    items: [
      { icon: Palette, title: 'Board and pieces', text: 'Pick the board colours and piece style you like best.', to: '/settings' },
      { icon: Settings2, title: 'How you play', text: 'Confirm moves, coordinates, legal-move dots and choosing your promotion piece.', to: '/settings' },
      { icon: Volume2, title: 'Sounds', text: 'Choose a sound pack, or turn sounds off, and vibration on your phone.', to: '/settings' },
      { icon: Swords, title: 'Warm up', text: 'Play a bot or solve a few puzzles before it begins.', to: '/practice' },
    ],
    notify: 'Turn on notifications', notifyText: "We'll tell you when your game starts.", notifyOn: 'Notifications on ✓',
    lang: 'Use ChessScout in English', langText: 'The whole app in English.',
    settings: 'Go to settings', tournament: 'See the tournament', later: 'Not now',
    luck: 'Good luck!',
  },
};

export function TournamentWelcome() {
  const { authUser } = useUser();
  const [location, navigate] = useLocation();
  const [t, setT] = useState<T | null>(null);
  const [lang, setL] = useState<'es' | 'en'>(() => (getLang() === 'es' || (typeof navigator !== 'undefined' && /^es/i.test(navigator.language)) ? 'es' : 'en'));
  const push = usePushNotifications();

  // Look again on sign-in and when someone opens a tournament (they may have just joined).
  useEffect(() => {
    if (!authUser) return;
    let live = true;
    apiFetch('/api/tournaments').then((r) => (r.ok ? r.json() : null)).then((d: { upcoming?: T[] } | null) => {
      if (!live || !d?.upcoming) return;
      const soon = d.upcoming.find((x) => {
        if (!x.joined) return false;
        const ms = new Date(x.startsAt).getTime() - Date.now();
        if (!(ms > 0 && ms < 4 * 86_400_000)) return false;
        try { return !localStorage.getItem(SEEN(x.id)); } catch { return false; }
      });
      if (soon) {
        setT(soon);
        if (isFirstOfficial(soon) && getLang() !== 'en') setL('es');
      }
    }).catch(() => {});
    return () => { live = false; };
  }, [authUser, location.startsWith('/tournaments')]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!t) return null;
  const s = TXT[lang];
  const group = t.clubName || t.name;
  const close = () => { try { localStorage.setItem(SEEN(t.id), '1'); } catch { /* ignore */ } setT(null); };
  const go = (to: string) => { close(); navigate(to); };
  const when = new Date(t.startsAt).toLocaleString(lang === 'es' ? 'es-MX' : undefined, { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
  const pushOn = push.permission === 'granted' && push.isSubscribed;
  const card = { background: '#141D1F', border: '1px solid #243033' };

  return (
    <div translate="no" className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center" style={{ background: 'rgba(0,0,0,.72)' }}>
      <div className="relative flex max-h-[92dvh] w-full max-w-[460px] flex-col overflow-y-auto rounded-t-[24px] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-[24px]" style={{ background: '#0D1516', border: '1px solid rgba(129,182,76,.35)' }}>
        <div className="absolute right-3 top-3 flex items-center gap-1">
          <div className="flex overflow-hidden rounded-full text-[11px] font-black" style={{ border: '1px solid rgba(255,255,255,.15)' }}>
            {(['es', 'en'] as const).map((l) => <button key={l} onClick={() => setL(l)} className="px-2.5 py-1" style={{ background: lang === l ? G : 'transparent', color: '#fff' }}>{l.toUpperCase()}</button>)}
          </div>
          <button onClick={close} aria-label={s.later} className="rounded-full p-1.5 text-white/60"><X size={18} /></button>
        </div>

        <div className="mt-6 flex flex-col items-center text-center">
          {t.logoUrl
            ? <img src={t.logoUrl} alt={group} className="h-24 w-24 rounded-[20px] object-contain p-1.5" style={{ background: '#fff' }} />
            : <div className="grid h-20 w-20 place-items-center rounded-[20px]" style={{ background: G }}><Trophy size={38} color="#fff" /></div>}
          <h2 className="mt-3 text-[24px] font-black leading-tight text-white">{s.welcome(group)}</h2>
          <p className="mt-1 text-[14px] font-bold" style={{ color: G }}>{t.name}</p>
          <p className="mt-0.5 text-[13px] text-white/60">{s.starts}: <span className="font-bold capitalize text-white/85">{when}</span>{t.timeControlLabel ? ` · ${t.timeControlLabel}` : ''}</p>
          <p className="mt-3 rounded-xl px-3 py-2.5 text-[14px] font-bold leading-snug text-white" style={card}>{isFirstOfficial(t) ? s.thanks : s.thanksOther}</p>
        </div>

        <p className="mb-2 mt-4 text-[12px] font-black uppercase tracking-wider text-white/45">{s.before}</p>
        <div className="space-y-2">
          {s.items.map(({ icon: Icon, title, text, to }) => (
            <button key={title} onClick={() => go(to)} className="flex w-full items-start gap-3 rounded-xl p-3 text-left" style={card}>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: 'rgba(129,182,76,.18)', color: G }}><Icon size={18} /></span>
              <span><span className="block text-[14px] font-extrabold text-white">{title}</span><span className="block text-[12.5px] leading-snug text-white/60">{text}</span></span>
            </button>
          ))}
          {push.supported && (
            <button onClick={() => { if (!pushOn) void push.subscribe(); }} className="flex w-full items-start gap-3 rounded-xl p-3 text-left" style={card}>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: 'rgba(129,182,76,.18)', color: G }}><Bell size={18} /></span>
              <span><span className="block text-[14px] font-extrabold text-white">{pushOn ? s.notifyOn : s.notify}</span><span className="block text-[12.5px] leading-snug text-white/60">{s.notifyText}</span></span>
            </button>
          )}
          {getLang() !== lang && (
            <button onClick={() => { close(); setLang(lang); }} className="flex w-full items-start gap-3 rounded-xl p-3 text-left" style={card}>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: 'rgba(129,182,76,.18)', color: G }}><Languages size={18} /></span>
              <span><span className="block text-[14px] font-extrabold text-white">{s.lang}</span><span className="block text-[12.5px] leading-snug text-white/60">{s.langText}</span></span>
            </button>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button onClick={() => go('/settings')} className="rounded-xl py-3 text-[14px] font-black text-white" style={{ background: G }}>{s.settings}</button>
          <button onClick={() => go(`/tournaments/${t.id}`)} className="rounded-xl py-3 text-[14px] font-black text-white" style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)' }}>{s.tournament}</button>
        </div>
        <p className="mt-3 text-center text-[14px] font-black text-white/80">{s.luck} ♞</p>
      </div>
    </div>
  );
}
