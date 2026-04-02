# Workspace

## Overview

Chess Coach - A full-stack chess analysis platform that imports games from chess.com, analyzes patterns across all your games using AI to identify weaknesses, and generates personalized courses to help you improve.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **AI**: OpenAI via Replit AI Integrations (gpt-5.2 for analysis, gpt-audio for TTS narration)
- **Frontend**: React + Vite + Tailwind CSS + Recharts

## Features

1. **Import Games**: Enter chess.com username and fetch games from the past N months
2. **Game Replay**: Interactive chess board with move-by-move navigation (first/prev/next/last/auto-play), move quality badges, engine eval bar
3. **AI Analysis** (Premium): Analyzes up to 50 games using GPT to identify weaknesses across 6 categories. Jobs persist in `background_jobs` DB table — navigating away won't lose progress; page resumes polling or shows results on return.
4. **Weakness Report**: Clickable cards → Weakness Detail page (`/analysis/:id`) with AI patterns, related games, related courses
5. **Performance Stats**: Win rate, opening stats (bar chart), time control breakdown, win/loss/draw pie chart
6. **Personalized Courses** (Premium): AI-generated courses with 4-5 annotated PGN lessons; generates by appending (not replacing) to preserve progress
7. **Interactive Course Viewer**: Sequential lesson mode, LessonBoardPlayer component, "Complete & Next" auto-advance
8. **Opponent Scout** (Premium) (`/opponents`): Enter any chess.com username — fetches their recent games, runs full AI analysis, shows their weaknesses and favourite openings. Results persist in `background_jobs` DB table — navigating away won't lose progress; page restores results or resumes polling on return.
9. **Practice Bots** (`/practice`): 8 AI bots from 400 to 2000 ELO with client-side minimax engine, piece-square tables, configurable depth/blunder rate. Live move analysis shows quality ratings (brilliant/excellent/good/inaccuracy/mistake/blunder), pros/cons, best move suggestion, and evaluation bar after every move.
10. **ELO-Based Improvement Tips**: Analysis page shows tier-specific tips based on average rating with progress bar to next tier
11. **Mobile Navigation**: Bottom tab bar with "More" drawer for secondary pages (Openings, Practice Bots, Import Games, Opponent Scout, Sign Out). All pages mobile-responsive.
12. **Global UserContext**: `src/context/UserContext.tsx` — single source of truth for auth state, no per-component useState drift
13. **Authentication**: Email/password + Google OAuth login, dual auth: session cookies (SameSite=None for cross-origin) + Bearer token fallback (stored in localStorage as `chess_coach_token`). Token returned from login/register endpoints and via URL hash from Google OAuth callback. `getSessionId()` in auth.ts checks Authorization header first, then cookies.
14. **Stripe Subscriptions**: Chess Coach Pro with $1/week and $4/month plans, 3-day free trial, Stripe Checkout + Customer Portal
15. **Premium Gating**: AI Analysis, Courses, TTS, and Opponent Scout gated behind subscription via `<PremiumGate>` component

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server
│   └── chess-coach/        # React + Vite frontend
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   ├── replit-auth-web/    # (unused, kept for compatibility)
│   └── db/                 # Drizzle ORM schema + DB connection
│       └── src/schema/
│           ├── games.ts    # Chess games table
│           ├── weaknesses.ts # Identified weaknesses
│           ├── courses.ts  # Courses + lessons tables
│           └── auth.ts     # Users + sessions tables (Stripe fields)
├── scripts/                # Utility scripts (seed-products.ts)
```

## API Routes

- `POST /api/games/import` — Import games from chess.com
- `GET /api/games` — List all imported games
- `GET /api/games/:id` — Get single game
- `GET /api/games/:id/replay` — Get game replay data with parsed moves
- `POST /api/analysis/analyze` — Run AI analysis on all games
- `GET /api/analysis/weaknesses` — Get weakness report
- `GET /api/analysis/summary` — Get performance summary stats
- `GET /api/analysis/weaknesses/:id` — Get weakness detail with related games + matching courses
- `GET /api/courses` — List personalized courses
- `POST /api/courses/generate` — Generate AI courses from weaknesses
- `GET /api/courses/:id` — Get course with lessons
- `PATCH /api/courses/:id/progress` — Update lesson completion
- `POST /api/auth/register` — Register with email/password (+ optional firstName, chesscomUsername)
- `POST /api/auth/login` — Login with email/password
- `GET /api/auth/google` — Initiate Google OAuth login
- `GET /api/auth/google/callback` — Google OAuth callback
- `POST /api/auth/logout` — Logout and destroy session
- `GET /api/auth/user` — Get current authenticated user
- `POST /api/auth/update-profile` — Update user profile (chesscomUsername, firstName)
- `GET /api/stripe/products` — List available subscription products
- `GET /api/stripe/config` — Get Stripe publishable key
- `POST /api/stripe/checkout` — Create Stripe Checkout session
- `GET /api/stripe/subscription` — Get current user's subscription status
- `POST /api/stripe/portal` — Create Stripe Customer Portal session
- `POST /api/track` — Track page view (public, no auth required)
- `GET /api/admin/stats` — Admin stats: page views, user count, active subscriptions
- `GET /api/admin/users` — Admin: list all registered users

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Key Packages

### `artifacts/api-server` (`@workspace/api-server`)

- Entry: `src/index.ts`
- App setup: `src/app.ts`
- Routes: `src/routes/` (games, analysis, courses, health, tts)
- Libs: `src/lib/chesscom.ts` (chess.com API + PGN parser), `src/lib/openaiAnalysis.ts` (AI analysis + course generation)

### `artifacts/chess-coach` (`@workspace/chess-coach`)

- React frontend with pages: Setup, Dashboard, Import, Games, GameReplay, Analysis, Courses, CourseDetail, Openings, OpeningDetail, OpponentAnalysis, PracticeBots
- ChessBoard component renders positions from FEN strings with Unicode pieces, supports drag-and-drop + click-to-move
- Uses recharts for performance charts
- QueryClient configured: retry=1, refetchOnWindowFocus=false, staleTime=30s
- Per-route ErrorBoundary wraps each protected page (fallback navigates to parent route via SPA routing)
- Global unhandledrejection handler suppresses transient errors (AbortError, network failures, 5xx ApiErrors) from triggering runtime error overlay

### `lib/db` (`@workspace/db`)

- `games` table: stores PGN, metadata, result, opening, rating
- `weaknesses` table: AI-identified weaknesses per username
- `courses` + `lessons` tables: personalized course content

Production migrations handled by Replit when publishing. In development: `pnpm --filter @workspace/db run push`.

## Vercel Deployment

The project includes `vercel.json` for deploying the frontend to Vercel as a static site.

### Setup
1. Connect your GitHub repo to Vercel
2. The `vercel.json` configures the build command, output directory, and SPA rewrites automatically
3. **Required env var**: Set `VITE_API_URL` in Vercel's environment variables to your Replit-published API URL (e.g. `https://your-app.replit.app`)
4. The API server runs on Replit — publish the app on Replit first so the API is available
5. CORS is enabled on the API server (allows all origins)

### How API routing works
- On Replit (dev): Vite proxy forwards `/api/*` to `localhost:8080`
- On Replit (published): Platform routes `/api/*` to the API server
- On Vercel: `VITE_API_URL` env var tells the frontend where to send API requests; the `apiFetch()` helper (`src/lib/api.ts`) prepends this base URL to all `/api/*` calls
- The generated API client hooks (`@workspace/api-client-react`) use `setBaseUrl()` from `customFetch` for the same purpose
