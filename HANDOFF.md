# ChessScout.net — Session Handoff

Covers everything from the embedded Stripe checkout work through the bot-game move-classification fix. Everything below is already committed and pushed via the accompanying `apply-all.sh` script — this doc is context for what's IN that batch and what still needs attention.

## Required manual steps before/after this deploys

1. **`pnpm install`** — `@stripe/stripe-js` and `@stripe/react-stripe-js` were added to `artifacts/chess-coach/package.json`. The build will fail without this.
2. **New env var**: `VITE_STRIPE_PUBLISHABLE_KEY` on Vercel — get it from Stripe Dashboard → Developers → API keys → Publishable key. Required for embedded checkout to load at all.
3. **DB migration** (if not already run from earlier in the session): `DATABASE_URL="..." pnpm --filter ./lib/db run push` — needed for the `affiliate_adjustments` table.
4. **Real-money test**: embedded checkout was built against Stripe's documented pattern but never click-tested end to end. Run a full test-mode purchase (card `4242 4242 4242 4242`) before trusting it with real customers.
5. **Stripe Connect**: was showing a "suspicious activity" restriction as of last check — needs the account owner to log into Stripe Dashboard and confirm intent before affiliate payouts will work.

## What's in this batch, grouped by feature

### 1. Embedded Stripe checkout (replaces redirect-based checkout on `/subscription`)
- `components/EmbeddedCheckoutForm.tsx` (new) — Stripe Elements PaymentElement, confirms in-page
- `pages/Subscription.tsx` — shows the embedded form instead of redirecting; the old `/api/stripe/checkout` redirect endpoint was left in place untouched, in case anything else depends on it
- `routes/stripe.ts` — new `/api/stripe/checkout-embedded` endpoint (payment-intent based, Stripe's documented pattern)
- `package.json` — new Stripe frontend deps

### 2. Real-user analytics bug fixes (from a heycatch.ai report showing rage-clicks and a broken funnel)
- `components/ChessBoard.tsx` — CONFIRM button had no immediate visual feedback, causing rage-clicks (up to 37/session in the data). Now disables instantly + shows a checkmark on tap.
- `pages/Setup.tsx` — game import+review previously only triggered from `/welcome`, which most users were skipping/bouncing from per the data. Now also fires directly on signup completion.
- `components/ImportStatusWatcher.tsx` — added a "we're importing your games" banner for the in-progress state (previously nothing showed until completion). Completion banner's primary CTA now points to `/analysis` instead of `/games`.
- `pages/Puzzles.tsx` + `routes/puzzles.ts` — "Try Again" on the no-puzzles state was re-running the identical failing query. Now clears the narrowing filters first. Also fixed a backend falsy-zero bug (`minRating=0` was silently dropped).

### 3. Local Play bugs (user-reported, not from analytics)
- `pages/LocalPlay.tsx` — two real bugs: (a) players could bypass the clock-confirm requirement entirely and make a second move before confirming the first, because the board's `practiceMode` never accounted for `awaitingSubmit`; (b) no way to undo a move before confirming via the clock. Both fixed — board now locks correctly, and there's an "Undo move" option while a move is pending.

### 4. Affiliate program additions (built on top of an earlier-session affiliate/Connect feature)
- `routes/admin.ts` — several additions: edit a user's referral/invite code (with uniqueness check), list individual referred signups (not just aggregate counts), by-email affiliate lookup for the admin panel selector, manual commission adjustments endpoint, the `req.params.userId` typing fix that broke a Vercel build earlier (destructured params need `as string`, not just destructuring — see existing pattern at line ~578 in that file if it recurs elsewhere)
- `db/schema/auth.ts` — new `affiliate_adjustments` table (audit-trailed manual commission corrections/bonuses)
- `pages/Admin.tsx` — Referred Signups panel (with checkbox-select + direct email via the existing composer), searchable user selector for the Affiliates panel (replacing a raw email text input), inline referral-code editor, adjustment UI, richer Landing Page Funnel display (see #6)

### 5. Raffle code rename
- `email.ts`, `RaffleRules.tsx`, `Admin.tsx`, `Raffle.tsx`, `Profile.tsx` — `ADCCB497` → `CHESSEDITZ` everywhere it was hardcoded. **This only changed display text.** The actual functional code lives in the database on luka's account (`inviteCode` field) — use the admin panel's inline edit (pencil icon next to Referral Codes) to change the real value, or the raffle bonus won't actually apply to anyone using "CHESSEDITZ" at checkout.

### 6. Detailed landing page funnel tracking (new)
- `routes/landingFunnel.ts` — extended event types: scroll depth milestones (25/50/75/100%), 10s engagement threshold, per-section `viewed_X`/`exit_X` events for 7 named sections (hero, how_it_works, differentiators, features, faq, pricing, final_cta)
- `lib/funnelTracking.ts` — added `trackFunnelEventBeacon()` using `navigator.sendBeacon` specifically for the exit event, since a regular `fetch()` can get cancelled during page teardown
- `hooks/use-landing-funnel-tracking.ts` (new) — IntersectionObserver + scroll + timer + visibilitychange/pagehide wiring
- `pages/LandingPage.tsx` — calls the hook, added `data-track-section="X"` to each of the 7 sections
- `pages/Admin.tsx` — Landing Page Funnel panel now shows scroll depth, engagement, and a per-section views-vs-exits breakdown
- **Note**: this only accumulates going forward. Give it real traffic time before expecting useful section-level data.

### 7. Bot game move misclassification fix
- Root cause: bot games use a completely separate, client-side classification (`analyzeMoveQuality` in `lib/chess-bot.ts`, NOT touched in this batch) that runs a hand-rolled minimax at **depth 2** — extremely shallow compared to real Stockfish, and its "book move" detection is a crude heuristic (pattern-matching "looks like a normal opening move"), not a real opening database lookup. This explains both "brilliant moves that aren't brilliant" and "book moves that aren't book."
- Decision made: keep instant depth-2 feedback live during play (avoids per-move network lag), but re-analyze with the real engine once the game ends.
- `routes/analysis.ts` — new `/api/analysis/analyze-moves` endpoint, takes a raw move list (no stored game needed, since bot games aren't persisted), runs the same Stockfish-based `classifyFromWinPctLoss` pipeline used elsewhere, including the sacrifice-check gate on "brilliant"
- `pages/PracticeBots.tsx` — new effect fires when the game ends, calls that endpoint, replaces the live (depth-2) labels with accurate ones
- **Not touched**: the live depth-2 labels shown *during* play are unchanged and still approximate — only the post-game labels are now accurate. If "still wrong during live play" comes up again, that's expected, not a regression.

## Known open items, not yet resolved

- **Game review (not bot games) classification accuracy** — reported as an issue in both game review and bot games. The game review pipeline (4 call sites feeding `classifyFromWinPctLoss`) uses real Stockfish and a real opening-book/ECO check, and traced cleanly with no structural bug found. If bad classifications are still reported specifically in game review after this batch, the next step is specific examples (a position + move + what it was labeled vs. what it should be).
- **Stripe international checkout** — appears to be a Stripe account/country-support matter rather than a code bug. Not resolved; needs Stripe-side research if still blocking real customers.
- **PayPal for affiliate payouts** — two approaches discussed (full API automation vs. simple manual-email-capture), no decision made, nothing built.
- **ChessNut smart board integration** — scoped (WebHID/Web Bluetooth needed for browser-based board support; the official EasyLink SDK is USB/native-only; Apple doesn't implement WebHID/Web Bluetooth in any iOS browser so board support would be desktop/Android-only) but not started. No starting slice (Local Play vs. Practice Bots vs. both) was picked yet.

