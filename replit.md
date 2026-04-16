# Overview

ChessScout.net is a full-stack chess analysis platform designed to help players improve by leveraging AI. It imports games from chess.com, identifies patterns and weaknesses across a user's entire game history using AI, and generates personalized courses. The platform aims to provide a comprehensive and interactive learning experience, making advanced chess analysis accessible to a wide audience.

# User Preferences

I want iterative development.
I prefer detailed explanations.
I want to be asked before making major changes.
I prefer to use simple language.
I like functional programming.
I do not want changes to the folder `artifacts/replit-auth-web/`.
I want to ensure all background job types (review, analysis, scout) have stale-job recovery: pending jobs older than 5-10 minutes should be auto-expired to prevent stuck polling after server crashes.
All status endpoints must enforce user ownership for IDOR protection.

# System Architecture

## UI/UX Decisions

The platform features a Chess.com-inspired theme with a dark brown/green palette (`#262421` background, `#302e2b` cards, `#81b64c` green accents). Consistent styling is applied across the dashboard, sidebar, bottom navigation, and course viewer using inline style constants for precise color control. The interface includes interactive chess boards with drag-and-drop functionality, move quality badges, engine evaluation bars, and a sequential lesson mode with a "Complete & Next" auto-advance feature. Commentary bubbles above the board and a horizontal scrollable move strip enhance the learning experience.

## Technical Implementations

The project is structured as a monorepo using pnpm workspaces, targeting Node.js 24 and TypeScript 5.9. The backend is built with Express 5, utilizing PostgreSQL and Drizzle ORM for data persistence. Zod is used for validation. API codegen is handled by Orval from an OpenAPI specification. The frontend is a React application built with Vite and styled using Tailwind CSS, with Recharts for data visualization.

## Feature Specifications

**Core Features:**
- **Game Import & Replay**: Users can import games from Chess.com and Lichess, which are then available for interactive replay with move-by-move navigation and engine evaluations. Game reviews run as background jobs. Supports Chess960 games with a fallback parser that handles non-standard castling (O-O/O-O-O) manually when chess.js fails. Import includes a "Re-sync" option (`forceUpdate`) to refresh PGN data for existing games (scoped by username). Admin panel includes per-user usage stats (games, puzzles, scouts, courses, page views, referrals) via `GET /api/admin/users/:userId/usage`. Multi-platform: `platform` column ('chesscom'|'lichess') on games table, `lichessGameId` for dedup, `lichessUsername` on users table. Lichess API client in `artifacts/api-server/src/lib/lichess.ts`. Games page has platform filter (All/Chess.com/Lichess) and CC/LC badges on game cards. Import page has platform toggle with per-platform username management. Games stored under the user's primary (chess.com) username for unified queries across platforms.
- **AI Analysis (Premium)**: GPT-powered analysis identifies weaknesses across games, generating a weakness report linked to specific game patterns and related courses.
- **Personalized Courses (Premium)**: AI-generated courses with annotated PGN lessons derived from the player's actual games, focusing on identified weaknesses. Lessons include fix examples and interactive drills.
- **Endgame Training (Premium)**: Comprehensive endgame courses covering checkmate patterns, essential endgames, and personalized lessons from user mistakes.
- **Opponent Scout (Premium)**: Analyze any chess.com username to identify their weaknesses and opening preferences.
- **Practice Bots**: Eight AI bots with configurable difficulty, offering live move analysis and quality ratings. The same bot engine powers the review sandbox — while a game review is processing, the user plays a mini-game against a bot tuned ~100 ELO above their rating (random color assignment, auto bot-first-move when player is black, game-over overlay with "Play Again"). Bot selection via `pickBot()` in `GameReplay.tsx`.
- **Local PvP**: Pass-and-play chess on the same device with optional timers.
- **Game Lookup**: Search and replay games between any two Chess.com players using the public API.
- **Scan Position**: Upload a screenshot of a chess board (from a book, screen, or over-the-board game) and AI vision (GPT-4o) recognizes every piece, converts to FEN. Users can then explore the position freely (sandbox mode) or play against AI from that position. Supports camera capture on mobile. Route: `/scan`, API: `POST /api/analysis/scan-position` (accepts base64 data URL, validates FEN structure). Located in `artifacts/chess-coach/src/pages/ScanPosition.tsx`.
- **Puzzles**: Interactive puzzle trainer with Lichess database puzzles and puzzles generated from user's analyzed games. Features daily limit (5/day free, unlimited Pro), stepwise move validation, rating/theme display, streak tracking, and accuracy stats. DB tables: `puzzles` (id, lichessId, fen, moves, rating, themes, source, gameId, explanation) and `puzzle_attempts` (id, userId varchar, puzzleId, solved, timeMs). API: GET /api/puzzles/next, POST /api/puzzles/:id/solve (stepwise with moveIndex), POST /api/puzzles/:id/explain, GET /api/puzzles/stats, GET /api/puzzles/my-puzzles, POST /api/puzzles/generate-from-games. Puzzle data format: FEN = player's turn (the side to move IS the player's color), moves = alternating player/opponent UCI moves starting with the player's first move. No opponent setup/trigger move. Board orientation matches FEN turn. Puzzles are chess.js-validated on both seed and serve. Auto-seeds 18 verified puzzles on startup + Lichess daily puzzle. AI explanations (gpt-4o-mini) are pre-generated on startup and cached in the `explanation` column; the frontend uses the cached explanation instantly on solve, falling back to the /explain endpoint if not yet cached. Explanation generation logic lives in `puzzleSeed.ts` (single source of truth).
- **ELO Progress Tracker**: Visual ELO progress indicator in the sidebar and mobile header showing rating change since the user signed up on ChessScout. Only counts games played after registration date (looked up via `usersTable.chesscomUsername`, case-insensitive). Displays per-platform (Chess.com CC / Lichess LC) sparkline charts with deltas and a combined "All" view when both platforms have data. When only one platform has data, falls back to a single sparkline. API: `GET /api/games/elo-progress?username=&platform=` (optional platform filter: chesscom|lichess). Hooks: `useEloProgress` (single), `useMultiEloProgress` (fetches combined + per-platform in parallel). Components: `MultiEloTrackerBadge` (per-platform sparklines + combined), `MultiEloInline` (compact CC/LC deltas), `EloTrackerBadge`/`EloTrackerInline` (single-platform fallback).
- **Performance Stats**: Track win rates, opening statistics, and time control breakdowns.

**System Design Choices:**
- **Authentication**: Supports email/password and Google OAuth, using session cookies and Bearer tokens.
- **Referral System**: Paid Pro subscribers get a unique 8-char hex invite code and shareable referral link (`?ref=CODE`). Referral codes are stored in `invite_code` on users table, generated only upon first active Stripe subscription. `referral_conversions` table tracks signups (`signed_up`) and Pro conversions (`converted`). Frontend persists referral codes via `localStorage('chessscout_ref')` across registration flows (email + Google OAuth). Profile page shows referral card with copy link, stats, and referral list. Non-Pro users see an "Unlock Referrals" prompt. API: `GET /api/auth/referrals`.
- **Subscription Management**: Integrates Stripe for ChessScout Pro subscriptions, including a free trial and premium feature gating.
- **Email Service**: Uses Resend for transactional and broadcast emails, including welcome emails, trial expiry reminders, and win-back campaigns.
- **Growth Engine**: Automated marketing system with direct posting to Discord (webhooks), Twitter/X (OAuth 1.0a), and Reddit (OAuth2 password flow). Features: campaign scheduler (node-cron, 15-min intervals), one-off "Post Now", AI content generation per platform, post history logging. Admin panel in Profile.tsx via `GrowthEngine` component. Email drip campaigns: welcome (on signup), trial expiry (12h before), win-back (7 days inactive). DB tables: `growth_credentials` (AES-256-CBC encrypted), `growth_campaigns`, `growth_post_log`, `email_drip_log`. Routes: `artifacts/api-server/src/routes/growth.ts`. Scheduler: `artifacts/api-server/src/lib/growthScheduler.ts`.
- **PWA Support**: The application is installable as a Progressive Web App, featuring a manifest, service worker for caching, and install prompts.
- **Global State Management**: `UserContext.tsx` serves as a single source of truth for authentication state.
- **Error Handling**: Per-route `ErrorBoundary` for protected pages, with a global unhandled rejection handler to suppress transient errors.
- **API Design**: RESTful API with clear endpoints for games, analysis, courses, authentication, and administrative tasks.

# External Dependencies

- **AI**: OpenAI (gpt-5.2 for player analysis, gpt-4o for game review, gpt-audio for TTS narration)
- **Chess Engine**: Local Stockfish 17 binary (via nix) for move evaluation. Move classification uses a comprehensive ECO opening book (`openingBook.ts`, ~300 lines covering all major openings A00-E99). Book moves are only assigned when the position matches known opening theory; once a move leaves the book, all subsequent moves are classified by engine eval only. Full engine-driven classification system: `brilliant` (sacrifice + engine top move + improves position significantly), `great` (momentum shift or few good alternatives, engine top move), `best` (engine's #1 choice), `excellent` (very close to best, ≤1% win loss), `good` (solid, ≤5% win loss), `book` (opening theory), `inaccuracy` (>5% win loss), `mistake` (>12% win loss), `blunder` (>25% win loss), `missed_win` (was winning ≥70% but dropped to ≤40%). Brilliant requires `isSacrificialMove()` check — piece left hanging or exchange sacrifice. When position is already decided (player win% <10 or >90), win% compresses at extremes, so raw centipawn loss is used as fallback: >300cp = blunder, >150cp = mistake, >75cp = inaccuracy.
- **Object Storage**: Google Cloud Storage via Replit sidecar for email image uploads.
- **Database**: PostgreSQL (managed by Replit for production).
- **Payment Gateway**: Stripe for subscriptions and customer portal.
- **Email Service**: Resend for email delivery.
- **Chess.com API**: For importing games and looking up player data.
- **Replit AI Integrations**: For accessing OpenAI services.