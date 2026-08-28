import { useEffect } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Trophy } from 'lucide-react';
import { setPageMeta } from '@/lib/pageMeta';

const G = '#81b64c';
const BG = '#262421';
const CARD = '#302e2b';
const TEXT = '#e8e6e3';
const MUTED = '#9e9b98';

const LAST_UPDATED = 'August 27, 2026';
const CONTACT_EMAIL = 'chessscout.net@gmail.com';
const REFERRAL_CODE = 'CHESSEDITZ';
const DRAWING_DATE = 'November 17, 2026';
const MIN_SUBS = 500;

export default function RaffleRulesPage() {
  useEffect(() => {
    setPageMeta(
      'Official Rules — ChessScout.net Pro Raffle',
      `Official rules for the ChessScout.net Pro subscriber raffle. Drawing on ${DRAWING_DATE}.`,
      '/raffle-rules',
    );
  }, []);

  return (
    <div className="min-h-screen" style={{ background: BG, color: TEXT }}>
      <nav
        className="sticky top-0 z-40 backdrop-blur-xl"
        style={{ background: `${BG}dd`, borderBottom: '1px solid rgba(255,255,255,0.05)' }}
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-8 h-14 flex items-center justify-between">
          <Link
            href="/raffle"
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
          <div className="rounded-xl p-2.5" style={{ background: 'rgba(129,182,76,0.15)', color: G }}>
            <Trophy size={22} />
          </div>
          <h1 className="text-3xl font-black" style={{ color: TEXT, letterSpacing: '-0.02em' }}>
            Official Rules — Pro Subscriber Raffle
          </h1>
        </div>
        <p className="text-xs mb-8" style={{ color: MUTED }}>Last updated: {LAST_UPDATED}</p>

        <div className="rounded-2xl p-6 sm:p-8 space-y-6 leading-relaxed text-sm" style={{ background: CARD, border: '1px solid rgba(255,255,255,0.06)' }}>

          <section>
            <p className="font-bold mb-1" style={{ color: G }}>NO PURCHASE OR PAYMENT IS NECESSARY TO ENTER OR WIN. A PURCHASE OR PAYMENT WILL NOT INCREASE YOUR CHANCES OF WINNING BEYOND WHAT IS DESCRIBED BELOW. See Section 4 for the free method of entry.</p>
            <p style={{ color: MUTED }}>Void where prohibited by law. Open only to legal residents of the United States (excluding Rhode Island and any other jurisdiction where this promotion is restricted or prohibited) who are 18 years of age or older at the time of entry.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2" style={{ color: G }}>1. Sponsor</h2>
            <p>This promotion (the "Raffle") is sponsored by ChessScout.net ("Sponsor," "we," "us," or "our"). Contact: <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: G }}>{CONTACT_EMAIL}</a>.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2" style={{ color: G }}>2. Promotion Period</h2>
            <p>The Raffle entry period begins on the date this page is published and ends at 11:59 PM Eastern Time on {DRAWING_DATE} (the "Entry Period"). The drawing will take place on or shortly after {DRAWING_DATE} (the "Drawing Date"). Sponsor's records are the sole official record of entry times.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2" style={{ color: G }}>3. Eligibility</h2>
            <p>The Raffle is open to legal residents of the United States who are at least 18 years old (or the age of majority in their jurisdiction, if older) at the time of entry, excluding residents of Rhode Island and any jurisdiction where this promotion is prohibited or restricted by law. Employees, contractors, and immediate family members (spouse, parents, children, siblings) or household members of Sponsor are not eligible to win the Prize.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2" style={{ color: G }}>4. How to Enter</h2>
            <p className="mb-3">There are two ways to receive entries, and one way to enter for free. You may use either or both entry methods below; entries are cumulative.</p>

            <p className="font-bold mt-4 mb-1" style={{ color: TEXT }}>Method 1 — Subscribe to ChessScout.net Pro (1 entry)</p>
            <p>Any individual who purchases and maintains an active ChessScout.net Pro subscription at any point during the Entry Period receives one (1) entry into the Raffle.</p>

            <p className="font-bold mt-4 mb-1" style={{ color: TEXT }}>Method 1B — Subscribe using referral code {REFERRAL_CODE} (2 entries total)</p>
            <p>Any individual who purchases and maintains an active ChessScout.net Pro subscription during the Entry Period and applies referral code <strong style={{ color: G }}>{REFERRAL_CODE}</strong> at checkout receives two (2) entries into the Raffle in place of the single entry described in Method 1. The referral code must be applied at the time of subscribing; it cannot be applied retroactively to an existing subscription.</p>

            <p className="font-bold mt-4 mb-1" style={{ color: TEXT }}>Method 2 — Free entry, no purchase necessary (1 entry)</p>
            <p>If you do not wish to purchase a subscription, you may still receive one (1) free entry by emailing <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: G }}>{CONTACT_EMAIL}</a> with the subject line "Raffle Entry," and including your full name and email address, during the Entry Period. Limit one (1) free entry per person regardless of the number of emails sent. Free entries are weighted identically to paid entries described in Method 1 — a free entry and a Method 1 paid-subscription entry each represent one (1) chance to win.</p>

            <p className="mt-3" style={{ color: MUTED }}>Limit: each individual may receive a maximum of two (2) total entries (achieved only via Method 1B), regardless of how many subscriptions, referral applications, or free-entry emails are submitted. Multiple accounts, subscriptions, or entries by the same individual will be treated as a single entrant at their highest qualifying entry count. Sponsor reserves the right to disqualify duplicate or fraudulent entries.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2" style={{ color: G }}>5. Minimum Participation Requirement</h2>
            <p>The Prize will be awarded only if Sponsor records at least {MIN_SUBS} qualifying Pro subscriptions (as described in Method 1 or Method 1B) during the Entry Period (the "Threshold"). If the Threshold is not met by the end of the Entry Period, the Raffle will be cancelled and no Prize will be awarded, regardless of the number of free entries received under Method 2. Sponsor will announce whether the Threshold was met on or before the Drawing Date via the ChessScout.net website and/or email to entrants.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2" style={{ color: G }}>6. Eligibility to Win at Time of Drawing</h2>
            <p>To be eligible to actually win the Prize, an entrant whose entry is based on a Pro subscription (Method 1 or Method 1B) must have an active, current ChessScout.net Pro subscription in good standing at the exact time the winner is drawn on the Drawing Date. If a selected entrant's subscription has lapsed, been cancelled, or is not active at the moment of the drawing, that entry is void and Sponsor will redraw from the remaining eligible pool of entries. Entries obtained via Method 2 (free entry) are not affected by this requirement, since no subscription was required to obtain them.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2" style={{ color: G }}>7. Prize</h2>
            <p>One (1) winner will receive one (1) ChessNut Air electronic chessboard (the "Prize"). Approximate retail value: as listed by the manufacturer at the time of the drawing. Actual value may vary; no cash alternative or substitution will be offered by Sponsor except that Sponsor reserves the right, in its sole discretion, to substitute a prize of equal or greater value if the specific product becomes unavailable. The Prize is awarded "as is" with no warranty, express or implied, from Sponsor. Any manufacturer's warranty is between the winner and the manufacturer.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2" style={{ color: G }}>8. Winner Selection and Odds</h2>
            <p>One (1) winning entry will be selected in a random drawing from all eligible entries on or shortly after the Drawing Date. Odds of winning depend on the total number of eligible entries received.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2" style={{ color: G }}>9. Winner Notification</h2>
            <p>The winner will be notified by email at the address associated with their entry within seven (7) days of the drawing. The winner must respond within seven (7) days of notification to claim the Prize and may be required to confirm eligibility, sign an affidavit of eligibility, and a liability/publicity release where permitted by law. If the winner cannot be reached, does not respond in time, or is found ineligible, Sponsor may select an alternate winner from the remaining eligible entries in its discretion.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2" style={{ color: G }}>10. Taxes</h2>
            <p>The winner is solely responsible for any and all applicable federal, state, and local taxes associated with acceptance and use of the Prize. If required by law, Sponsor may issue an IRS Form 1099 or equivalent to the winner reflecting the Prize's fair market value.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2" style={{ color: G }}>11. General Conditions</h2>
            <p>Sponsor reserves the right, in its sole discretion, to cancel, suspend, modify, or terminate the Raffle, or these Official Rules, at any time and for any reason, including if fraud, technical failure, or any factor beyond Sponsor's reasonable control impairs the integrity of the Raffle, subject to applicable law. Sponsor reserves the right to disqualify any individual it finds, in its sole discretion, to be tampering with the entry process, violating these rules, or acting in an unsportsmanlike or disruptive manner.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2" style={{ color: G }}>12. Release and Limitation of Liability</h2>
            <p>By entering, participants agree to release and hold harmless Sponsor, and its officers, directors, employees, and agents, from any and all liability, claims, or actions of any kind arising from participation in the Raffle or acceptance, use, or misuse of the Prize, to the fullest extent permitted by law. Sponsor is not responsible for entries lost, delayed, misdirected, or not received due to technical issues of any kind, including issues related to email delivery.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2" style={{ color: G }}>13. Publicity</h2>
            <p>Except where prohibited, acceptance of the Prize constitutes permission for Sponsor to use the winner's first name, city/state, and statements regarding the Raffle for promotional purposes in any media, without additional compensation, unless prohibited by law.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2" style={{ color: G }}>14. Privacy</h2>
            <p>Information collected in connection with the Raffle will be used to administer the Raffle and will otherwise be handled consistent with our <Link href="/privacy" style={{ color: G }}>Privacy Policy</Link>. It will not be sold to third parties.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2" style={{ color: G }}>15. Governing Law</h2>
            <p>This Raffle and these Official Rules are governed by the laws of the United States and the state in which Sponsor operates, without regard to conflict-of-law principles, to the extent consistent with applicable law in the entrant's jurisdiction.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2" style={{ color: G }}>16. Questions</h2>
            <p>Questions about these Official Rules or the Raffle may be directed to <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: G }}>{CONTACT_EMAIL}</a>.</p>
          </section>

          <p className="text-xs pt-4" style={{ color: MUTED, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            This promotion is in no way sponsored, endorsed, administered by, or associated with ChessNut, Chess.com, or Lichess.
          </p>
        </div>
      </main>
    </div>
  );
}
