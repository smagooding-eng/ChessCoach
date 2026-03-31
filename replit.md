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
3. **AI Analysis**: Analyzes up to 50 games using GPT to identify weaknesses across 6 categories
4. **Weakness Report**: Clickable cards → Weakness Detail page (`/analysis/:id`) with AI patterns, related games, related courses
5. **Performance Stats**: Win rate, opening stats (bar chart), time control breakdown, win/loss/draw pie chart
6. **Personalized Courses**: AI-generated courses with 4-5 annotated PGN lessons; generates by appending (not replacing) to preserve progress
7. **Interactive Course Viewer**: Sequential lesson mode, LessonBoardPlayer component, "Complete & Next" auto-advance
8. **Opponent Scout** (`/opponents`): Enter any chess.com username — fetches their recent games, runs full AI analysis, shows their weaknesses and favourite openings
9. **Global UserContext**: `src/context/UserContext.tsx` — single source of truth for auth state, no per-component useState drift

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
│   └── db/                 # Drizzle ORM schema + DB connection
│       └── src/schema/
│           ├── games.ts    # Chess games table
│           ├── weaknesses.ts # Identified weaknesses
│           └── courses.ts  # Courses + lessons tables
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

- React frontend with pages: Setup, Dashboard, Import, Games, GameReplay, Analysis, Courses, CourseDetail
- ChessBoard component renders positions from FEN strings with Unicode pieces
- Uses recharts for performance charts

### `lib/db` (`@workspace/db`)

- `games` table: stores PGN, metadata, result, opening, rating
- `weaknesses` table: AI-identified weaknesses per username
- `courses` + `lessons` tables: personalized course content

Production migrations handled by Replit when publishing. In development: `pnpm --filter @workspace/db run push`.
