import { Link } from 'wouter';
import { ArrowLeft, Linkedin } from 'lucide-react';

const G = '#81b64c';
const BG = '#141413';
const TEXT = '#e8e6e3';
const MUTED = '#9e9b98';
const CARD = '#1c1b19';

// STUBBED PAGE -- per the site audit's own instruction (D3.3), a real
// founder name, photo, LinkedIn link, and short story are what actually
// build trust here. Placeholder content would defeat the purpose and
// risks being misleading, so none is invented. Replace the three
// FOUNDER_* constants below with the real values, then this page is done.
const FOUNDER_NAME = '[Your name]';
const FOUNDER_PHOTO_URL = ''; // e.g. '/founder.jpg' -- add the image to /public first
const FOUNDER_LINKEDIN_URL = ''; // e.g. 'https://linkedin.com/in/yourprofile'
const FOUNDER_STORY = '[3-4 sentences: why you built ChessScout, what problem you kept running into as a player, what you wanted a tool like this to do that nothing else did.]';

export default function AboutPage() {
  return (
    <div className="min-h-screen" style={{ background: BG, color: TEXT }}>
      <div className="max-w-2xl mx-auto px-4 sm:px-8 py-12">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm mb-8" style={{ color: MUTED }}>
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <h1 className="text-3xl font-black mb-8" style={{ color: TEXT }}>About ChessScout</h1>

        <div className="rounded-xl p-6 sm:p-8 mb-8" style={{ background: CARD, border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-4 mb-5">
            {FOUNDER_PHOTO_URL ? (
              <img src={FOUNDER_PHOTO_URL} alt={FOUNDER_NAME} className="w-16 h-16 rounded-full object-cover" />
            ) : (
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-xs text-center px-1"
                style={{ background: 'rgba(255,255,255,0.05)', color: MUTED, border: '1px dashed rgba(255,255,255,0.15)' }}>
                Add photo
              </div>
            )}
            <div>
              <p className="text-lg font-black" style={{ color: TEXT }}>{FOUNDER_NAME}</p>
              <p className="text-xs" style={{ color: MUTED }}>Founder, ChessScout.net</p>
            </div>
          </div>

          <p className="text-sm leading-relaxed mb-5" style={{ color: TEXT }}>{FOUNDER_STORY}</p>

          {FOUNDER_LINKEDIN_URL ? (
            <a href={FOUNDER_LINKEDIN_URL} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-bold" style={{ color: G }}>
              <Linkedin className="w-4 h-4" /> Connect on LinkedIn
            </a>
          ) : (
            <p className="text-xs" style={{ color: MUTED }}>[Add LinkedIn link]</p>
          )}
        </div>

        <p className="text-sm" style={{ color: MUTED }}>
          Questions or feedback? Reach out anytime — I read every message.
        </p>
      </div>
    </div>
  );
}
