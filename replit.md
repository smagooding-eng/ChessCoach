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
- **Game Import & Replay**: Users can import games from chess.com, which are then available for interactive replay with move-by-move navigation and engine evaluations. Game reviews run as background jobs.
- **AI Analysis (Premium)**: GPT-powered analysis identifies weaknesses across games, generating a weakness report linked to specific game patterns and related courses.
- **Personalized Courses (Premium)**: AI-generated courses with annotated PGN lessons derived from the player's actual games, focusing on identified weaknesses. Lessons include fix examples and interactive drills.
- **Endgame Training (Premium)**: Comprehensive endgame courses covering checkmate patterns, essential endgames, and personalized lessons from user mistakes.
- **Opponent Scout (Premium)**: Analyze any chess.com username to identify their weaknesses and opening preferences.
- **Practice Bots**: Eight AI bots with configurable difficulty, offering live move analysis and quality ratings.
- **Local PvP**: Pass-and-play chess on the same device with optional timers.
- **Game Lookup**: Search and replay games between any two Chess.com players using the public API.
- **Puzzles**: Interactive puzzle trainer with Lichess database puzzles and puzzles generated from user's analyzed games. Features daily limit (5/day free, unlimited Pro), stepwise move validation, rating/theme display, streak tracking, and accuracy stats. DB tables: `puzzles` (id, lichessId, fen, moves, rating, themes, source, gameId) and `puzzle_attempts` (id, userId varchar, puzzleId, solved, timeMs). API: GET /api/puzzles/next, POST /api/puzzles/:id/solve (stepwise with moveIndex), GET /api/puzzles/stats, GET /api/puzzles/my-puzzles, POST /api/puzzles/generate-from-games.
- **Performance Stats**: Track win rates, opening statistics, and time control breakdowns.

**System Design Choices:**
- **Authentication**: Supports email/password and Google OAuth, using session cookies and Bearer tokens.
- **Subscription Management**: Integrates Stripe for ChessScout Pro subscriptions, including a free trial and premium feature gating.
- **Email Service**: Uses Resend for transactional and broadcast emails, including welcome emails.
- **PWA Support**: The application is installable as a Progressive Web App, featuring a manifest, service worker for caching, and install prompts.
- **Global State Management**: `UserContext.tsx` serves as a single source of truth for authentication state.
- **Error Handling**: Per-route `ErrorBoundary` for protected pages, with a global unhandled rejection handler to suppress transient errors.
- **API Design**: RESTful API with clear endpoints for games, analysis, courses, authentication, and administrative tasks.

# External Dependencies

- **AI**: OpenAI (gpt-5.2 for player analysis, gpt-4o for game review, gpt-audio for TTS narration)
- **Chess Engine**: Local Stockfish 17 binary (via nix) for move evaluation.
- **Object Storage**: Google Cloud Storage via Replit sidecar for email image uploads.
- **Database**: PostgreSQL (managed by Replit for production).
- **Payment Gateway**: Stripe for subscriptions and customer portal.
- **Email Service**: Resend for email delivery.
- **Chess.com API**: For importing games and looking up player data.
- **Replit AI Integrations**: For accessing OpenAI services.