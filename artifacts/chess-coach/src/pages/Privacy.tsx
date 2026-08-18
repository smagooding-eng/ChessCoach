import { useEffect } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

const G = '#81b64c';
const BG = '#262421';
const CARD = '#302e2b';
const TEXT = '#e8e6e3';
const MUTED = '#9e9b98';

const LAST_UPDATED = 'April 20, 2026';
const CONTACT_EMAIL = 'smagooding@gmail.com';

export default function PrivacyPage() {
  useEffect(() => {
    document.title = 'Privacy Policy — ChessScout';
  }, []);

  return (
    <div className="min-h-screen" style={{ background: BG, color: TEXT }}>
      <nav
        className="sticky top-0 z-40 backdrop-blur-xl"
        style={{ background: `${BG}dd`, borderBottom: '1px solid rgba(255,255,255,0.05)' }}
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-8 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm font-medium transition-colors"
            style={{ color: MUTED }}
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
          <div className="flex items-center gap-0.5">
            <span className="text-lg font-black" style={{ color: TEXT }}>Chess</span>
            <span className="text-lg font-black" style={{ color: G }}>Scout</span>
          </div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 sm:px-8 py-10">
        <div className="flex items-center gap-3 mb-2">
          <div
            className="rounded-xl p-2.5"
            style={{ background: 'rgba(129,182,76,0.15)', color: G }}
          >
            <ShieldCheck size={22} />
          </div>
          <h1 className="text-3xl font-black" style={{ color: TEXT, letterSpacing: '-0.02em' }}>
            Privacy Policy
          </h1>
        </div>
        <p className="text-xs mb-8" style={{ color: MUTED }}>Last updated: {LAST_UPDATED}</p>

        <div
          className="rounded-2xl p-6 sm:p-8 space-y-6 leading-relaxed text-sm"
          style={{ background: CARD, border: '1px solid rgba(255,255,255,0.06)', color: TEXT }}
        >
          <Section title="Who we are">
            ChessScout (the "Service", "we", "us") is a chess coaching and analysis tool that
            helps players review their games, identify weaknesses, and improve. This Privacy
            Policy explains what information we collect, how we use it, and the choices you have.
          </Section>

          <Section title="Information we collect">
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong>Account information:</strong> name, email address, and profile picture you
                provide directly or through Google Sign-In.
              </li>
              <li>
                <strong>Chess account handles:</strong> your Chess.com and/or Lichess usernames so
                we can fetch your games for analysis.
              </li>
              <li>
                <strong>Game data:</strong> publicly available games (PGN, opponents, ratings,
                openings, results, timestamps) imported from the platforms you link.
              </li>
              <li>
                <strong>Usage data:</strong> pages visited, features used, and basic device
                information used to operate and improve the Service.
              </li>
              <li>
                <strong>Payment data:</strong> handled by Stripe. We do not store your full card
                details on our servers.
              </li>
            </ul>
          </Section>

          <Section title="How we use your information">
            <ul className="list-disc pl-5 space-y-1.5">
              <li>To provide game analysis, coaching insights, and personalized training.</li>
              <li>To authenticate you and keep your account secure.</li>
              <li>To process subscriptions through Stripe.</li>
              <li>To send transactional emails (verification, billing receipts, account notices).</li>
              <li>To improve product features, fix bugs, and prevent abuse.</li>
            </ul>
          </Section>

          <Section title="How we share information">
            We do not sell your personal information. We share data only with service providers
            necessary to operate the Service, including:
            <ul className="list-disc pl-5 mt-2 space-y-1.5">
              <li><strong>Google</strong> — for Sign-In with Google.</li>
              <li><strong>Stripe</strong> — for subscription billing.</li>
              <li><strong>Resend</strong> — for transactional email delivery.</li>
              <li><strong>Chess.com and Lichess</strong> — only to fetch your public game history at your request.</li>
              <li><strong>Hosting & infrastructure providers</strong> — to run the Service.</li>
            </ul>
          </Section>

          <Section title="Data retention">
            We keep your account and game data for as long as your account is active. You can
            request deletion of your account and associated data at any time by contacting us at
            the email below.
          </Section>

          <Section title="Your choices">
            <ul className="list-disc pl-5 space-y-1.5">
              <li>You can update your profile and linked chess handles in the Profile page.</li>
              <li>You can cancel your subscription at any time from the Subscription page.</li>
              <li>You can request a copy or deletion of your data by emailing us.</li>
            </ul>
          </Section>

          <Section title="Children">
            The Service is not directed to children under 13, and we do not knowingly collect
            personal information from them.
          </Section>

          <Section title="Security">
            We use industry-standard practices to protect your information, including encrypted
            connections and hashed passwords. No system is 100% secure, but we work to safeguard
            your data.
          </Section>

          <Section title="Changes to this policy">
            We may update this Privacy Policy from time to time. When we do, we will revise the
            "Last updated" date above and, where appropriate, notify you via email or in-app.
          </Section>

          <Section title="Contact us">
            Questions or requests about your data? Email us at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: G }} className="font-bold">
              {CONTACT_EMAIL}
            </a>
            .
          </Section>
        </div>

        <div className="mt-8 text-center">
          <Link href="/" className="text-xs font-bold" style={{ color: MUTED }}>
            ← Back to ChessScout
          </Link>
        </div>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-black mb-2" style={{ color: G, letterSpacing: '-0.01em' }}>
        {title}
      </h2>
      <div style={{ color: TEXT }}>{children}</div>
    </section>
  );
}
