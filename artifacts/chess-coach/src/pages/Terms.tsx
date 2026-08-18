import { useEffect } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, FileText } from 'lucide-react';

const G = '#81b64c';
const BG = '#262421';
const CARD = '#302e2b';
const TEXT = '#e8e6e3';
const MUTED = '#9e9b98';

const LAST_UPDATED = 'April 20, 2026';
const CONTACT_EMAIL = 'smagooding@gmail.com';

export default function TermsPage() {
  useEffect(() => {
    document.title = 'Terms of Service — ChessScout';
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
            <FileText size={22} />
          </div>
          <h1 className="text-3xl font-black" style={{ color: TEXT, letterSpacing: '-0.02em' }}>
            Terms of Service
          </h1>
        </div>
        <p className="text-xs mb-8" style={{ color: MUTED }}>Last updated: {LAST_UPDATED}</p>

        <div
          className="rounded-2xl p-6 sm:p-8 space-y-6 leading-relaxed text-sm"
          style={{ background: CARD, border: '1px solid rgba(255,255,255,0.06)', color: TEXT }}
        >
          <Section title="Acceptance of terms">
            By creating an account or using ChessScout (the "Service"), you agree to these Terms
            of Service. If you do not agree, please do not use the Service.
          </Section>

          <Section title="The service">
            ChessScout provides chess coaching tools, including game import and analysis,
            weakness identification, opening trainers, and related features. Features may change,
            be added, or removed over time.
          </Section>

          <Section title="Eligibility">
            You must be at least 13 years old to use the Service. By using ChessScout you confirm
            that you meet this requirement and that the information you provide is accurate.
          </Section>

          <Section title="Accounts">
            <ul className="list-disc pl-5 space-y-1.5">
              <li>You are responsible for keeping your login credentials secure.</li>
              <li>You are responsible for activity that occurs under your account.</li>
              <li>Notify us immediately if you suspect unauthorized use of your account.</li>
            </ul>
          </Section>

          <Section title="Subscriptions and billing">
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                ChessScout offers a free tier and a paid Pro subscription. Pro features are
                available through a paid subscription processed by Stripe.
              </li>
              <li>
                You can cancel your subscription at any time from the Subscription page; access
                continues until the end of the current billing period.
              </li>
              <li>
                Except where required by law, payments are non-refundable.
              </li>
              <li>Pricing and plans may change with reasonable notice.</li>
            </ul>
          </Section>

          <Section title="Acceptable use">
            You agree not to:
            <ul className="list-disc pl-5 mt-2 space-y-1.5">
              <li>Use the Service to cheat in live or rated chess games.</li>
              <li>Reverse engineer, scrape, or interfere with the Service.</li>
              <li>Upload malicious code or attempt to gain unauthorized access.</li>
              <li>Resell, sublicense, or redistribute the Service without permission.</li>
              <li>Violate any applicable law or third-party rights.</li>
            </ul>
          </Section>

          <Section title="Third-party services">
            ChessScout integrates with third parties such as Chess.com, Lichess, Google, and
            Stripe. Your use of those services is governed by their own terms and policies.
          </Section>

          <Section title="Intellectual property">
            All content, software, and design elements of ChessScout are owned by us or our
            licensors and are protected by intellectual property laws. You retain ownership of
            content you submit, but grant us a limited license to use it to operate the Service.
          </Section>

          <Section title="Disclaimers">
            The Service is provided "as is" and "as available" without warranties of any kind,
            either express or implied. We do not guarantee that the Service will be uninterrupted,
            error-free, or that analysis will be perfectly accurate.
          </Section>

          <Section title="Limitation of liability">
            To the maximum extent permitted by law, ChessScout and its operators will not be
            liable for any indirect, incidental, special, consequential, or punitive damages, or
            any loss of data, profits, or goodwill arising from your use of the Service. Our
            total liability will not exceed the amount you paid us in the prior 12 months.
          </Section>

          <Section title="Termination">
            We may suspend or terminate your account if you violate these Terms or if required by
            law. You may stop using the Service at any time and request account deletion.
          </Section>

          <Section title="Changes to these terms">
            We may update these Terms from time to time. When we do, we will revise the "Last
            updated" date above and, where appropriate, notify you via email or in-app. Continued
            use of the Service after changes constitutes acceptance of the updated Terms.
          </Section>

          <Section title="Governing law">
            These Terms are governed by the laws of the jurisdiction in which the Service
            operator resides, without regard to conflict of law principles.
          </Section>

          <Section title="Contact us">
            Questions about these Terms? Email us at{' '}
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
