import React, { useState } from 'react';
import { Copy, Check, ExternalLink, Globe, MessageSquare, ListChecks } from 'lucide-react';

// Directory kit (Admin > Growth & Marketing): the places worth listing
// ChessScout.net so other sites mention it, which is what search engines
// and AI assistants (ChatGPT, Claude, Perplexity) lean on when they answer
// "what's a good chess app". Each entry has what to submit and the copy,
// ready to paste. Ticks are saved in this browser only.

const CARD: React.CSSProperties = { background: '#302e2b', border: '1px solid rgba(255,255,255,0.05)' };
const INNER: React.CSSProperties = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' };
const GREEN = '#81B64C';
const MUTED = '#9e9b98';
const STORE = 'cs_directory_kit_done';
const utm = (src: string, path = '/') => `https://chessscout.net${path}${path.includes('?') ? '&' : '?'}utm_source=${src}&utm_medium=directory&utm_campaign=listing`;

// ── The copy, in every length directories ask for ───────────────────────────
const COPY = {
  name: 'ChessScout.net',
  tagline: 'Chess: Play. Get Better.',
  short: 'Play chess online free, get every game reviewed (Chess.com and Lichess too), and scout any opponent. Chess for Kids included.',
  medium: 'ChessScout.net is a free chess site and Android app where you play and improve in one place. Play live and daily games against real people, join tournaments, practice against bots from 400 to 3000, and solve unlimited puzzles. Link your Chess.com or Lichess account and those games are reviewed with Stockfish for free. Before a game, scout any opponent to see what they play. Chess for Kids teaches young beginners one piece at a time, and the app is Teacher Approved on Google Play. Available in 28 languages.',
  long: `ChessScout.net is a free chess site and Android app where you play and improve in one place.

Play: live games against real people (ranked or casual), daily games you can move in whenever you have a minute, challenge links for friends, and arena and knockout tournaments that anyone can create for a club, class or group. Ten practice bots, from 400 to 3000, give live feedback on every move.

Improve: every game can be reviewed with Stockfish for free, including the games you play on Chess.com and Lichess, which import automatically. Unlimited puzzles, an Opening Trainer and chess traps are free too. Pro ($5/month) adds an AI coach that explains your games in plain language, finds the mistakes you repeat across games, and builds personalized courses from them.

Scout: type any Chess.com or Lichess username to see their record, their openings as White and Black, and your head-to-head results.

Kids and beginners: Chess for Kids teaches young beginners one piece at a time through nine colorful worlds, and the Beginner Path takes adults from the rules to their first real games. ChessScout.net is Teacher Approved on Google Play.

Works in any browser and on Android, in 28 languages.`,
  tags: 'chess, play chess online, chess app, chess for kids, learn chess, chess puzzles, chess tournaments, chess game analysis, chess coach, Stockfish, Chess.com, Lichess',
  alternativeTo: 'Chess.com, Lichess, ChessKid, Aimchess, Chessable, Chess Tempo',
  pricing: 'Freemium: free plan with live play, tournaments, puzzles and game review; Pro $5/month.',
  platforms: 'Web (any browser), Android (Google Play: net.chessscout.app)',
  links: `Website: https://chessscout.net
Google Play: https://play.google.com/store/apps/details?id=net.chessscout.app
Instagram: https://www.instagram.com/chessscout.net3/
TikTok: https://www.tiktok.com/@chessscout.net3
Contact: ChessScout.net@gmail.com`,
};

interface Dir { id: string; name: string; url: string; why: string; how: string; cost: string; link: string }
const DIRECTORIES: Dir[] = [
  { id: 'alternativeto', name: 'AlternativeTo', url: 'https://alternativeto.net/', cost: 'Free',
    why: 'Shows up when people search "Chess.com alternatives" or "apps like Lichess", and AI assistants read it.',
    how: 'Create an account, add ChessScout.net as a new app, then add it as an alternative to Chess.com, Lichess, ChessKid and Aimchess. Use the short and long descriptions and the tags.', link: utm('alternativeto') },
  { id: 'producthunt', name: 'Product Hunt', url: 'https://www.producthunt.com/', cost: 'Free',
    why: 'A launch page that stays indexed and is widely cited. Best launched on a Tuesday to Thursday, 12:01am Pacific.',
    how: 'Create a maker account, schedule a launch, use the tagline, the medium description, 4 to 6 screenshots from Share Kit, and post a first comment explaining why you built it.', link: utm('producthunt') },
  { id: 'saashub', name: 'SaaSHub', url: 'https://www.saashub.com/', cost: 'Free',
    why: 'Software directory with "alternatives" pages that rank in search.',
    how: 'Submit the product, then add Chess.com and Lichess as alternatives.', link: utm('saashub') },
  { id: 'slant', name: 'Slant', url: 'https://www.slant.co/', cost: 'Free',
    why: 'Community "what are the best chess apps" questions where anyone can add an option. Often cited by AI answers.',
    how: 'Search Slant for questions like "best chess apps", "best websites to play chess online" and "best chess apps for kids", and add ChessScout.net as an option with honest pros and cons.', link: utm('slant') },
  { id: 'crunchbase', name: 'Crunchbase', url: 'https://www.crunchbase.com/', cost: 'Free basic profile',
    why: 'A company profile search engines and AI tools use to confirm a product exists and what it does.',
    how: 'Create a free account and add an organization profile for ChessScout.net with the medium description, website and social links.', link: 'https://chessscout.net' },
  { id: 'linkedin', name: 'LinkedIn company page', url: 'https://www.linkedin.com/company/setup/new/', cost: 'Free',
    why: 'Another trusted profile that confirms the product and links back.',
    how: 'Create a company page, use the medium description, and link the website.', link: 'https://chessscout.net' },
  { id: 'betalist', name: 'BetaList', url: 'https://betalist.com/', cost: 'Free (long queue) or paid to skip',
    why: 'Startup directory with a permanent listing page.',
    how: 'Submit with the tagline and the short description. The free queue can take weeks.', link: utm('betalist') },
  { id: 'indiehackers', name: 'Indie Hackers', url: 'https://www.indiehackers.com/products', cost: 'Free',
    why: 'Product page plus a community that likes solo-developer stories.',
    how: 'Add the product, then post a short story about building it on your own (see the Reddit "founder story" draft below).', link: utm('indiehackers') },
  { id: 'uneed', name: 'Uneed', url: 'https://www.uneed.best/', cost: 'Free queue or paid',
    why: 'Launch directory with a permanent listing.',
    how: 'Submit with the tagline, short description and screenshots.', link: utm('uneed') },
  { id: 'showhn', name: 'Hacker News (Show HN)', url: 'https://news.ycombinator.com/submit', cost: 'Free',
    why: 'One good Show HN post can bring thousands of visits and lasting links.',
    how: 'Title it "Show HN: ChessScout.net – play chess and get your Chess.com/Lichess games reviewed". Link the home page, then add a first comment on how it works and what you learned building it.', link: 'https://chessscout.net' },
  { id: 'commonsense', name: 'Common Sense Media', url: 'https://www.commonsensemedia.org/about-us/contact-us', cost: 'Free (editorial, not guaranteed)',
    why: 'Parents and schools check it; a review there carries a lot of trust for Chess for Kids.',
    how: 'Reviews are chosen by their editors. Use their contact page to suggest ChessScout.net for review, mentioning Chess for Kids, Kid Mode and Teacher Approved.', link: utm('commonsense', '/chess-for-kids') },
  { id: 'quora', name: 'Quora answers', url: 'https://www.quora.com/search?q=best%20chess%20app', cost: 'Free',
    why: 'Old Quora answers keep getting read and are often quoted by AI assistants.',
    how: 'Answer questions like "What is the best app to learn chess?" honestly and in full. Mention ChessScout.net as one option among others and say you built it.', link: utm('quora') },
  { id: 'trustpilot', name: 'Trustpilot business profile', url: 'https://business.trustpilot.com/', cost: 'Free',
    why: 'A place for real members to leave reviews that search engines show.',
    how: 'Claim the free profile. Only invite real members to review; never write or buy reviews.', link: 'https://chessscout.net' },
];

// ── Reddit ────────────────────────────────────────────────────────────────
interface RedditPost { sub: string; rules: string; title: string; body: string }
const REDDIT: RedditPost[] = [
  { sub: 'r/chess', rules: 'Strict about self-promotion. Lead with something useful (data), disclose you built the site, and post from an account with some normal participation.',
    title: 'I went through the recent Chess.com games of top grandmasters: here are the openings they actually play and how they score',
    body: `I built a tool that reads public Chess.com games, and I pointed it at the grandmasters and leaderboard players on Chess.com to see what they really play online (not what they play over the board).

A few things that stood out:
- [fill in 3 or 4 real findings from https://chessscout.net/chess-openings, for example which opening is most popular as Black against 1.e4, which one scores best for White]

Every opening has its own page with the players who use it most and their results: https://chessscout.net/chess-openings
And each player has a page with their full repertoire: https://chessscout.net/players

Full disclosure: I'm the developer of ChessScout.net. The pages are free and don't need an account. Happy to pull other numbers if anyone's curious.` },
  { sub: 'r/chessbeginners', rules: 'Helpful posts are welcome; keep the link secondary and disclose.',
    title: 'The opening traps beginners fall into most, explained move by move (and the safe reply for each)',
    body: `When I was learning, most of my early losses were the same handful of traps. I wrote each one up move by move: how it works, the exact move that falls for it, and what to play instead.

[paste two traps in short form here, e.g. the move list and one line on the mistake]

The full list is here, free and without an account: https://chessscout.net/chess-traps
You can also practice each one from both sides on a board.

Disclosure: I built ChessScout.net. Feedback very welcome, especially on traps I should add.` },
  { sub: 'r/Chesscom', rules: 'Allowed if it helps Chess.com players; disclose.',
    title: 'Free tool: scout any Chess.com opponent\'s openings before your game',
    body: `Before tournament games I always wanted to know what my opponent plays without scrolling through their whole archive, so I built this: type a Chess.com (or Lichess) username and it shows their openings as White and Black, their results in each, and your head-to-head.

It's free and unlimited: https://chessscout.net/scout-chess-opponent

Disclosure: I'm the developer. Would love to hear what else would help you prepare.` },
  { sub: 'r/homeschool (or r/Parenting)', rules: 'Read each subreddit\'s rules first; many allow resources if you disclose and don\'t spam.',
    title: 'A free way to teach young kids chess, one piece at a time',
    body: `I built Chess for Kids for children who are just starting: nine little worlds (Pawn Village, Knight Forest and so on), each teaching one piece with short puzzles on a real board. Kids can start without an account, and it's Teacher Approved on Google Play.

https://chessscout.net/chess-for-kids

Disclosure: I'm the developer. If you try it with your kids, I'd really value hearing what they liked and what confused them.` },
  { sub: 'r/SideProject and r/IndieHackers', rules: 'Self-promotion is the point here; tell the story.',
    title: 'I built a chess site on my own: live play, tournaments, game review and a kids\' mode, in 28 languages',
    body: `For the past months I've been building ChessScout.net by myself: a place to play chess (live, daily, tournaments, bots from 400 to 3000) and get better (free Stockfish review of every game, including your Chess.com and Lichess games).

Some things I learned:
- [your real lessons: what worked, what didn't, what surprised you]

It's on the web and Google Play: https://chessscout.net
I'd love feedback on the first screen and sign-up, which is where most visitors leave.` },
  { sub: 'r/androidapps', rules: 'Uses a weekly self-promotion thread; post there.',
    title: 'ChessScout.net: play chess, tournaments, kids mode and free game review (Android)',
    body: `Chess app I built: live and daily games, tournaments, bots from 400 to 3000, unlimited puzzles, Chess for Kids (Teacher Approved), and free review of your games including Chess.com and Lichess. 28 languages.

https://play.google.com/store/apps/details?id=net.chessscout.app

Feedback welcome, I'm the developer.` },
];

function useDone() {
  const [done, setDone] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; } });
  const toggle = (id: string) => setDone((d) => { const n = { ...d, [id]: !d[id] }; try { localStorage.setItem(STORE, JSON.stringify(n)); } catch { /* ignore */ } return n; });
  return [done, toggle] as const;
}

function CopyBox({ label, text, rows = 2 }: { label: string; text: string; rows?: number }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="rounded-lg p-2.5" style={INNER}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>{label} <span className="normal-case">({text.length} chars)</span></span>
        <button type="button" onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); }); }}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-bold" style={{ background: 'rgba(255,255,255,.06)', color: ok ? GREEN : '#fff' }}>
          {ok ? <Check size={12} /> : <Copy size={12} />} {ok ? 'Copied' : 'Copy'}
        </button>
      </div>
      <textarea readOnly value={text} rows={rows} className="w-full resize-y bg-transparent text-[12.5px] leading-snug text-white outline-none" />
    </div>
  );
}

export function DirectoryKitPanel() {
  const [done, toggle] = useDone();
  const count = DIRECTORIES.filter((d) => done[d.id]).length;
  return (
    <div className="space-y-4">
      <div className="rounded-xl p-4" style={CARD}>
        <h3 className="flex items-center gap-2 text-[16px] font-extrabold text-white"><Globe size={17} style={{ color: GREEN }} /> Directory kit</h3>
        <p className="mt-1 text-[13px]" style={{ color: MUTED }}>
          AI assistants and search engines recommend apps that other sites talk about. Each listing below is a page on someone else's site that mentions and links ChessScout.net.
          Work through them a few at a time; the copy is ready to paste. {count}/{DIRECTORIES.length} done.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <CopyBox label="Name" text={COPY.name} rows={1} />
          <CopyBox label="Tagline" text={COPY.tagline} rows={1} />
          <CopyBox label="Short description" text={COPY.short} />
          <CopyBox label="Tags" text={COPY.tags} />
          <CopyBox label="Alternative to" text={COPY.alternativeTo} rows={1} />
          <CopyBox label="Pricing" text={COPY.pricing} rows={1} />
          <CopyBox label="Platforms" text={COPY.platforms} rows={1} />
          <CopyBox label="Links" text={COPY.links} rows={4} />
        </div>
        <div className="mt-2 grid gap-2">
          <CopyBox label="Medium description" text={COPY.medium} rows={4} />
          <CopyBox label="Long description" text={COPY.long} rows={8} />
        </div>
      </div>

      <div className="rounded-xl p-4" style={CARD}>
        <h3 className="flex items-center gap-2 text-[15px] font-extrabold text-white"><ListChecks size={16} style={{ color: GREEN }} /> Where to list it</h3>
        <div className="mt-3 space-y-2">
          {DIRECTORIES.map((d) => (
            <div key={d.id} className="rounded-lg p-3" style={{ ...INNER, opacity: done[d.id] ? 0.6 : 1 }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-[14px] font-extrabold text-white">
                  <input type="checkbox" checked={!!done[d.id]} onChange={() => toggle(d.id)} className="h-4 w-4 accent-[#81B64C]" />
                  {d.name}
                  <span className="rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={{ background: 'rgba(255,255,255,.06)', color: MUTED }}>{d.cost}</span>
                </label>
                <a href={d.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12.5px] font-bold" style={{ color: GREEN }}>Open <ExternalLink size={12} /></a>
              </div>
              <p className="mt-1 text-[12.5px]" style={{ color: MUTED }}><b className="text-white">Why:</b> {d.why}</p>
              <p className="mt-0.5 text-[12.5px]" style={{ color: MUTED }}><b className="text-white">How:</b> {d.how}</p>
              <p className="mt-0.5 break-all text-[11.5px]" style={{ color: MUTED }}>Link to use: {d.link}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl p-4" style={CARD}>
        <h3 className="flex items-center gap-2 text-[15px] font-extrabold text-white"><MessageSquare size={16} style={{ color: GREEN }} /> Reddit plan</h3>
        <p className="mt-1 text-[13px]" style={{ color: MUTED }}>
          One post a week at most, each in a different community. Lead with something useful, say plainly that you built it, and answer every comment.
          Fill in the bracketed parts with real numbers or real experience before posting.
        </p>
        <div className="mt-3 space-y-3">
          {REDDIT.map((r) => (
            <div key={r.sub} className="rounded-lg p-3" style={INNER}>
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-[14px] font-extrabold text-white">
                  <input type="checkbox" checked={!!done[`reddit:${r.sub}`]} onChange={() => toggle(`reddit:${r.sub}`)} className="h-4 w-4 accent-[#81B64C]" />
                  {r.sub}
                </label>
              </div>
              <p className="mt-1 text-[12px]" style={{ color: MUTED }}>{r.rules}</p>
              <div className="mt-2 space-y-2">
                <CopyBox label="Title" text={r.title} rows={2} />
                <CopyBox label="Post" text={r.body} rows={7} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
