// Answer pages: plain, honest articles for the questions people ask Google and
// ChatGPT ("free chess game review", "how do I stop blundering"...). Seeded on
// startup into seo_articles (published). A slug that already exists is left
// alone, so edits made in the admin are never overwritten. Every claim about
// ChessScout matches the pricing table: free vs Pro ($5/month).
export interface GeoArticle { slug: string; title: string; targetKeyword: string; metaDescription: string; content: string }

const FREE_PRO = `## What's free on ChessScout and what's Pro

- **Free:** single-game review with Stockfish, basic analysis of your reviewed games, unlimited puzzles, practice bots and the opening trainer, live and daily games, opponent scouting with unlimited stats, and creating tournaments.
- **Pro ($5/month):** AI coach explanations and game summaries, deep weakness analysis, patterns across all your games, personalized courses, scanning a position from a photo, and AI prep against a specific opponent.`;

export const GEO_ARTICLES: GeoArticle[] = [
  {
    slug: 'free-chess-game-review',
    title: 'How to Review Your Chess Games for Free (Step by Step)',
    targetKeyword: 'free chess game review',
    metaDescription: 'Review your Chess.com or Lichess games for free: every move rated by Stockfish, your mistakes explained, and what to play instead. A step-by-step guide.',
    content: `Reviewing your own games is the fastest way to improve at chess, and you can do it for free. The idea is simple: go through a game you just played, find the moves that changed the result, and understand what you should have played instead.

## Step 1: Pick the right games

Review games you **lost** or that felt close. A game you won easily teaches less. Two or three reviewed games a week beats twenty games played and never looked at again.

## Step 2: Get every move rated

A chess engine (Stockfish) checks each move and labels it: best, excellent, good, inaccuracy, mistake or blunder. On [ChessScout](/), link your Chess.com or Lichess username and your recent games come in automatically. Open a game and tap Review: every move gets its label, and you can step through the game move by move.

## Step 3: Stop at the big swings

Don't study every move. Jump to the two or three moments where the evaluation swung the most. For each one, ask:

- What was my opponent threatening?
- What did the engine want instead, and why?
- Did I have time? Was I rushing?

## Step 4: Look for the pattern

One blunder is bad luck. The same kind of blunder in five games is a weakness you can fix. After a few reviews, write down what keeps happening: hanging pieces, missing forks, losing on time, the same opening going wrong.

## Step 5: Train that one thing

If you keep missing forks, do fork puzzles. If the same opening keeps going wrong, drill it in an opening trainer. ChessScout links each mistake to the matching [tactics](/chess-tactics) and openings so you can train it straight away.

${FREE_PRO}

## Other free options

Lichess also gives free computer analysis of your games, and Chess.com includes a limited game review on its free plan. ChessScout's difference is that it reviews games from both sites in one place and connects your mistakes to training.`,
  },
  {
    slug: 'chess-com-game-review-alternative',
    title: 'Free Alternatives to Chess.com Game Review',
    targetKeyword: 'chess.com game review alternative',
    metaDescription: 'Looking for a free alternative to Chess.com Game Review? Compare Lichess analysis, ChessScout and other options for reviewing your games at no cost.',
    content: `Chess.com's Game Review is good, but the full version is part of its paid plans. If you want to review every game without paying, here are the honest options.

## 1. Lichess computer analysis

Free and unlimited. Import any game (including Chess.com games) and run Stockfish on it. You get an evaluation graph and the engine's best moves. It doesn't explain mistakes in words, and it doesn't connect your games together.

## 2. ChessScout

Link your Chess.com or Lichess username and your games come in automatically. Every game can be reviewed free with Stockfish: each move labelled from best to blunder, the key moments marked, and what to play instead. Your reviewed games also feed a basic analysis of what you get wrong most often.

Pro ($5/month) adds AI coach explanations in plain words, deep weakness analysis and patterns across all your games.

## 3. A desktop engine

Programs like the free Stockfish app or a chess GUI let you analyze games offline. It's powerful but takes the most work: you load each game yourself and interpret the numbers.

## Which one should you use?

- **Just want the engine lines:** Lichess analysis.
- **Want your games reviewed automatically, with your mistakes connected to training:** [ChessScout](/).
- **Want everything offline:** a desktop engine.

${FREE_PRO}`,
  },
  {
    slug: 'how-to-stop-blundering-in-chess',
    title: 'How to Stop Blundering in Chess: 7 Habits That Work',
    targetKeyword: 'how to stop blundering in chess',
    metaDescription: 'Blunders lose more games than anything else. Seven practical habits to stop hanging pieces and missing threats, plus how to find your own blunder patterns.',
    content: `Most games below 1500 are decided by one blunder, not by deep strategy. The good news: blundering is a habit problem, and habits can be trained.

## 1. Ask "what does my opponent want?" every move

Before you think about your own plan, look at the move your opponent just played. What does it attack? What does it threaten next move? Most blunders happen because this question was skipped.

## 2. Check every piece you leave undefended

Before you move, look at the piece you're moving and the pieces it was protecting. Is anything left hanging?

## 3. Checks, captures, threats

Before you commit, scan every check, capture and threat, for both sides. It takes ten seconds and catches most tactics.

## 4. Slow down on easy moves

Blunders cluster on moves that feel obvious. If a move feels automatic, spend two extra seconds on it.

## 5. Don't play in time trouble

If you keep blundering with under a minute left, play a slower time control for a while, or spend less time early in the game.

## 6. Do tactics puzzles daily

Ten minutes of puzzles a day trains you to see forks, pins and skewers, both yours and your opponent's. [ChessScout puzzles](/chess-puzzles) are unlimited and free.

## 7. Find your own blunder pattern

Everyone blunders differently. Some hang pieces to knight forks, others miss back-rank mates. Review your last ten lost games and note what kind of blunder lost each one. [ChessScout](/) reviews your Chess.com and Lichess games with Stockfish for free and marks every blunder, so the pattern shows up quickly.

${FREE_PRO}`,
  },
  {
    slug: 'find-your-chess-weaknesses',
    title: 'How to Find Your Chess Weaknesses From Your Own Games',
    targetKeyword: 'find chess weaknesses',
    metaDescription: 'Your weaknesses are already in your games. How to find them: what to look for in your losses, which patterns matter, and how to train each one.',
    content: `Most players train what they enjoy, not what's losing them games. Your real weaknesses are already recorded in your game history; you just need to read it.

## Look at your losses, not your wins

Take your last 20 losses. For each one, write down the main reason it was lost. Use simple labels:

- Missed tactic (yours or theirs)
- Opening went wrong
- Endgame mistake
- Time trouble
- Positional collapse (bad plan, bad pawn structure)

After 20 games, one or two labels will stand out. Those are your weaknesses.

## Separate openings by colour

Many players are solid with White and weak with Black, or the other way round. Check your results by opening and by colour. An opening you lose with again and again is worth replacing or studying.

## Watch the clock

If many losses happen with little time left, your weakness may be time management, not chess knowledge.

## Let an engine do the counting

Doing this by hand works but takes hours. [ChessScout](/) imports your Chess.com or Lichess games, reviews them with Stockfish, and builds a basic analysis of what you get wrong, for free. Pro ($5/month) adds deep weakness analysis and patterns across all your games, plus personalized courses built from them.

## Then train one thing at a time

Pick the biggest weakness and train it for two weeks: [tactics](/chess-tactics) for missed tactics, an opening trainer for opening problems, endgame drills for endgames. Then check your games again.

${FREE_PRO}`,
  },
  {
    slug: 'how-to-prepare-for-a-chess-opponent',
    title: 'How to Scout Your Chess Opponent Before a Game',
    targetKeyword: 'prepare for chess opponent',
    metaDescription: 'Playing a tournament or a club rival? How to look up their openings, results and habits before the game, and turn it into a simple plan.',
    content: `Strong players prepare for their opponents. You can too, even at club level, in about ten minutes.

## 1. Find their games

Most players have an online account on Chess.com or Lichess. Their public games show what they really play.

## 2. Check their openings

Look at what they play as White, and what they answer to 1.e4 and 1.d4 as Black. Most club players repeat the same two or three openings.

## 3. Look at how they lose

Do they lose on time? In long endgames? To early attacks? This tells you what kind of game to aim for.

## 4. Make a simple plan

Pick one opening line you're comfortable with that meets their favourite opening, and decide what kind of position you want: sharp or quiet, long or short.

## Do it in seconds

[ChessScout's Opponent Scout](/scout-chess-opponent) does steps 1 to 3 for you: type any Chess.com or Lichess username and get their openings and results. The stats are free and unlimited. Pro ($5/month) adds AI-found weaknesses and prep against that opponent.

${FREE_PRO}`,
  },
  {
    slug: 'how-to-run-an-online-chess-tournament-for-free',
    title: 'How to Run an Online Chess Tournament for Free (Club, School or Office)',
    targetKeyword: 'run online chess tournament free',
    metaDescription: 'Run a free online chess tournament for your club, school, company or friends: knockout or arena, live or daily, one link to join, and anyone can watch.',
    content: `You don't need software, a budget or a referee to run a chess tournament. Here's how to set one up online in a few minutes.

## 1. Choose the format

- **Knockout:** players are paired in a bracket; winners go through. Clear and exciting, best for 8 to 32 players.
- **Arena:** everyone plays as many games as they can in a set time; points decide the winner. Best when people join and leave.

## 2. Choose the speed

- **Live:** everyone plays at the same time, for example 10 minutes a game. Good for an evening event.
- **Daily:** one move a day (or 3 or 7 days a move). Ideal for schools and companies, where people play between classes or shifts.

## 3. Name it and add your logo

A real name and logo ("Office Championship 2026", your club's crest) makes people take part.

## 4. Share one link

Send the link in your group chat, class or company email. Players join with one tap.

## 5. Let everyone watch

Friends, parents and colleagues like to follow along. A watch page that anyone can open, without signing up, keeps the event alive.

## How to do it on ChessScout

On [ChessScout tournaments](/chess-tournaments) all of this is free: knockout or arena, live or daily, your own name and logo, one link to join, and a public page where anyone can watch the games live, including an all-boards view you can put on a TV or stream. Pairings and results are automatic.

${FREE_PRO}`,
  },
  {
    slug: 'como-organizar-un-torneo-de-ajedrez-online-gratis',
    title: 'Cómo organizar un torneo de ajedrez online gratis (club, escuela o empresa)',
    targetKeyword: 'organizar torneo de ajedrez online gratis',
    metaDescription: 'Organiza un torneo de ajedrez online gratis para tu club, escuela o empresa: eliminatoria o arena, en vivo o diario, un enlace para unirse y todos pueden verlo.',
    content: `No necesitas programas, presupuesto ni árbitro para organizar un torneo de ajedrez. Así se prepara uno online en pocos minutos.

## 1. Elige el formato

- **Eliminatoria:** los jugadores se emparejan en un cuadro y el ganador avanza. Ideal para 8 a 32 jugadores.
- **Arena:** cada uno juega todas las partidas que pueda en un tiempo fijo y gana quien sume más puntos.

## 2. Elige el ritmo

- **En vivo:** todos juegan a la vez, por ejemplo 10 minutos por partida.
- **Diario:** una jugada al día (o 3 o 7 días por jugada). Perfecto para escuelas y empresas: se juega entre clases o turnos.

## 3. Ponle nombre y logo

Un nombre propio y el logo de tu club o empresa hacen que la gente participe.

## 4. Comparte un solo enlace

Envía el enlace por WhatsApp, a tu clase o por correo. Los jugadores se unen con un toque.

## 5. Que todos puedan verlo

Amigos, familias y compañeros pueden seguir las partidas en vivo desde una página pública, sin registrarse.

## Cómo hacerlo en ChessScout

En [los torneos de ChessScout](/es/chess-tournaments) todo esto es gratis: eliminatoria o arena, en vivo o diario, tu nombre y logo, un enlace para unirse y una página pública para ver las partidas en vivo, con una vista de todos los tableros para proyectar o transmitir. Los emparejamientos y resultados son automáticos.

ChessScout Pro (5 USD al mes) añade explicaciones de un coach con IA, análisis profundo de debilidades y torneos Pro; lo básico es gratis.`,
  },
  {
    slug: 'best-free-chess-apps-to-improve',
    title: 'The Best Free Chess Apps to Actually Improve (Not Just Play)',
    targetKeyword: 'best free chess app to improve',
    metaDescription: 'Playing more games doesn\'t make you better. The best free chess apps for improving: what each does well, honestly compared, including Lichess, Chess.com and ChessScout.',
    content: `Playing more doesn't make you better on its own; reviewing and training does. Here are free apps that help you improve, and what each is best at.

## Lichess

Completely free and open source. Unlimited games, puzzles, studies and computer analysis. Best for: players who want everything free and don't mind doing their own analysis.

## Chess.com

The biggest player base, lessons, puzzles and a polished game review. The free plan limits some features, including full game reviews. Best for: finding opponents at any time.

## ChessScout

Built around improvement: it imports your games from Chess.com and Lichess, reviews them with Stockfish for free, and connects your mistakes to training (tactics, openings, endgames). Free also includes unlimited puzzles, opponent scouting stats, practice bots, an opening trainer and tournaments. Pro ($5/month) adds AI coach explanations, deep weakness analysis and personalized courses. Best for: players who already play on Chess.com or Lichess and want to know what to fix.

## How to combine them

Play where your friends are (Chess.com or Lichess), then review those same games and train your weak spots on [ChessScout](/). Twenty minutes of review and training a day beats an hour of extra blitz.

${FREE_PRO}`,
  },
  {
    slug: 'chess-for-kids-how-to-start',
    title: 'How to Teach Kids Chess: A Simple Way to Start',
    targetKeyword: 'how to teach kids chess',
    metaDescription: 'Teach your child chess one piece at a time: short lessons, simple games and kid-friendly tactics. A practical plan for parents, no chess expertise needed.',
    content: `You don't need to be a strong player to teach a child chess. Kids learn best one piece at a time, with short, playful lessons.

## Start with one piece

Begin with the rook: it moves in straight lines. Let your child move it around an empty board and capture pawns. Then add the bishop, the queen, the king, the knight and finally the pawns.

## Play mini-games before full games

- **Pawn wars:** only pawns. First to reach the other side wins.
- **Capture the pawns:** one rook against a few pawns.

Mini-games teach the moves without the frustration of a full game.

## Keep it short

Ten to fifteen minutes is plenty. Stop while it's still fun.

## Add simple tactics

Once they know the moves, show them a fork ("two-for-one") and a pin ("stuck piece"). Kids love spotting these.

## Use a kids mode

[ChessScout for kids](/chess-for-kids) has step-by-step lessons for every piece, kid-friendly tactics, and a Kid Mode that keeps children on the kids pages. It's free to start.

## Play together

The best motivator is playing with a parent. Let them win sometimes, and celebrate good moves, not just wins.`,
  },
  {
    slug: 'analyze-chess-position-from-photo',
    title: 'How to Analyze a Chess Position From a Photo',
    targetKeyword: 'analyze chess position from photo',
    metaDescription: 'Turn a photo or screenshot of a chess board into a position you can analyze: the best move, the line after it, and playing it out.',
    content: `Saw an interesting position in a book, over the board or in a screenshot? You can turn the picture into a position and check it with an engine.

## Option 1: Set it up by hand

Most analysis boards (Lichess, ChessScout) have a board editor. Place the pieces, choose who is to move, and run the engine. It's free but slow for a busy position.

## Option 2: Scan it

A board scanner reads the photo and sets the position up for you. On ChessScout, Scan Position (part of Pro, $5/month) turns a photo or screenshot into a board, then shows the best move and the line after it. You can analyze it further or play it out against a bot.

## Tips for a good scan

- Take the photo from straight above, with the whole board in frame.
- Avoid strong glare on the pieces.
- Check the side to move and castling rights before analyzing.

## What to do with the position

Don't just look at the best move. Ask why it's best: what does it threaten, and what did the other moves miss? That's how a single position teaches you something.

${FREE_PRO}`,
  },
  {
    slug: 'review-chess-com-games-without-membership',
    title: 'How to Review Your Chess.com Games Without a Membership',
    targetKeyword: 'review chess.com games free',
    metaDescription: 'Review every Chess.com game for free, without a Diamond membership: link your username and each game is checked move by move with Stockfish.',
    content: `You don't need a paid Chess.com plan to go through your games properly. Chess.com publishes every finished game, so any review tool can read them.

## The quickest way

1. Go to [ChessScout](/) and sign up free (Google, Lichess or email).
2. Type your Chess.com username. Your recent games come in automatically, and new ones arrive after you play.
3. Open any game. Every move is checked by Stockfish and labeled: best, excellent, good, inaccuracy, mistake, blunder or missed win, with your accuracy for the game.
4. Step through it move by move. On a costly move, see the better move and play it out.

There's no daily limit on reviews: wins, losses and draws.

## What to look at first

- **The turning point:** the one move where the evaluation swung against you.
- **Missed wins:** positions where you were winning and let it go.
- **Repeats:** the same kind of mistake across several games (hanging pieces, missed forks, time trouble).

## After a few games

Your openings page shows your win rate with each line you actually play, and the endgames page shows how you convert (or don't) once the queens come off. That's where reviewing turns into improving.

${FREE_PRO}`,
  },
  {
    slug: 'how-to-analyze-lichess-games',
    title: 'How to Analyze Your Lichess Games (and Learn From Them)',
    targetKeyword: 'analyze lichess games',
    metaDescription: 'Lichess gives free computer analysis. Here is how to use it well, and how to review all your Lichess games together to find what keeps costing you.',
    content: `Lichess offers free computer analysis on every game: open the game, tap "Request a computer analysis" and you get an evaluation graph and Stockfish's best moves. That's great for one game. The harder part is learning across many games.

## Analyze one game well

- Find the biggest swing on the graph and start there, not at move 1.
- Before looking at the engine's move, ask what your opponent was threatening.
- Play the better move out a few moves so you see why it's better.

## Analyze all your games together

On [ChessScout](/), sign in with Lichess (one tap) and your games are imported and reviewed automatically. Every move gets a label, every game an accuracy score, and your openings and endgames are tracked over time, so you see patterns, not just single mistakes.

You can also play on Lichess straight from ChessScout and have the game reviewed when it ends.

${FREE_PRO}`,
  },
  {
    slug: 'chess-move-labels-explained',
    title: 'Brilliant, Best, Inaccuracy, Mistake, Blunder: Chess Move Labels Explained',
    targetKeyword: 'chess blunder vs mistake vs inaccuracy',
    metaDescription: 'What the move labels in a chess game review mean: brilliant, great, best, excellent, good, inaccuracy, mistake, blunder and missed win, and how they are decided.',
    content: `Game reviews label each move by how much it changed the position compared with the engine's best move. The loss is measured in centipawns (hundredths of a pawn).

## The labels

- **Best:** the engine's top choice, or as good as it.
- **Excellent / Good:** close to best; small or no loss.
- **Inaccuracy:** a small loss; the position got somewhat worse.
- **Mistake:** a clear loss; a real part of your advantage (or your safety) is gone.
- **Blunder:** a big loss, usually material or the game.
- **Missed win:** you had a winning move and played something that let the win go.
- **Great / Brilliant:** the only good move in a hard position, or a strong sacrifice that works.
- **Book:** a known opening move.

## Why the same move can get different labels

The label depends on the position, not the move. Losing a pawn's worth when you're a queen up barely matters; losing it in an equal endgame can decide the game. Good reviewers also don't punish moves in positions that were already lost.

## Using the labels

Don't count blunders, find the turning point: the first move where the game swung for good. On [ChessScout](/) every review starts with the moves that cost the most, and you can replay the better move on the spot.

${FREE_PRO}`,
  },
  {
    slug: 'chess-accuracy-score-explained',
    title: 'What Is Accuracy in Chess? Your Accuracy Score Explained',
    targetKeyword: 'chess accuracy score',
    metaDescription: 'What a chess accuracy score measures, what a good accuracy is at your level, and why your accuracy can be high in a game you lost.',
    content: `Accuracy is a 0 to 100 score for how close your moves were to the engine's best moves over a whole game. It's based on how much winning chance each move gave away.

## What's a good accuracy?

It depends on your level and the game. Club players often score in the 60s to 80s; strong players regularly go above 90 in quiet games. Short, sharp games and long, simple ones score very differently, so compare games of the same kind.

## Why accuracy can mislead

- **You can lose with high accuracy:** one blunder in an otherwise clean game.
- **You can win with low accuracy:** your opponent blundered more.
- **Simple positions inflate it:** forced recaptures and obvious moves count too.

## What to do with it

Track it over many games, not one. A slowly rising average means you're improving. On [ChessScout](/) every reviewed game shows both players' accuracy, and your games over time show the trend.

${FREE_PRO}`,
  },
  {
    slug: 'how-to-get-better-at-chess-fast',
    title: 'How to Get Better at Chess Fast (What Actually Works)',
    targetKeyword: 'how to get better at chess',
    metaDescription: 'A practical plan to improve at chess quickly: review your own games, fix the one mistake you repeat most, do targeted puzzles, and play longer games.',
    content: `Most players improve slowly because they play a lot and review nothing. Here's a plan that works at any level below master.

## 1. Review every game you lose

Find the turning point and the better move. Ten minutes per game is enough. On [ChessScout](/) your Chess.com and Lichess games are imported and reviewed for free, so this takes one tap.

## 2. Find the one thing you repeat

After ten reviewed games, one pattern will stand out: hanging pieces, missed tactics, a bad opening, time trouble. Fix that before anything else.

## 3. Puzzles on your weak spot

Do puzzles of the type you keep missing (forks, pins, back-rank mates), not random ones. Fifteen focused minutes a day beats an hour of random puzzles.

## 4. Play some longer games

Blitz builds speed, not understanding. Play rapid (10 or 15 minutes) a few times a week so you have time to think, and review those games.

## 5. Know your openings by results

You don't need deep theory. Look at your win rate with each opening you actually play and drop or fix the worst one.

${FREE_PRO}`,
  },
  {
    slug: 'best-chess-openings-for-beginners',
    title: 'Best Chess Openings for Beginners (and How to Pick Yours)',
    targetKeyword: 'best chess openings for beginners',
    metaDescription: 'Simple, sound chess openings for beginners with White and Black, the ideas behind them, and how to choose by checking your own results.',
    content: `The best opening for a beginner is one that develops pieces quickly, fights for the center and keeps the king safe. You don't need memorized lines, just the ideas.

## With White

- **Italian Game (1.e4 e5 2.Nf3 Nc6 3.Bc4):** fast development, natural plans, aims at f7.
- **London System (1.d4, 2.Bf4, e3, Nf3):** the same setup against almost anything; easy to learn.

## With Black against 1.e4

- **1...e5:** classical and sound; meet the Italian or Ruy Lopez with natural development.
- **Caro-Kann (1...c6):** solid, few early traps, good pawn structure.

## With Black against 1.d4

- **Queen's Gambit Declined (1...d5 2.c4 e6):** solid and principled.

## How to choose yours

Play what you enjoy, then check the numbers. [ChessScout](/) shows your win rate with every opening you actually play, from your real Chess.com and Lichess games, so you can see which lines are working and which keep losing.

${FREE_PRO}`,
  },
  {
    slug: 'stop-losing-on-time-in-chess',
    title: 'How to Stop Losing on Time in Chess',
    targetKeyword: 'losing on time chess',
    metaDescription: 'Why you keep running out of time in chess games and practical habits to fix it: opening speed, when to think long, and choosing the right time control.',
    content: `Flagging (running out of time) loses as many games as blunders at club level. The fix is mostly habit.

## Why it happens

- Thinking long on easy moves in the opening.
- Searching for a perfect move when a good one is enough.
- Panicking after a mistake and burning time.

## Habits that fix it

1. **Play your first 8 to 10 moves quickly:** know your openings well enough to.
2. **Think long only at critical moments:** captures, checks, threats, and positions where the plan changes.
3. **Use a budget:** at move 20 you should still have about half your time.
4. **When short on time, simplify:** trade pieces and make safe moves.
5. **Choose the right time control:** if you flag a lot in 5 minutes, add increment (5|3) or play 10.

## Check it in your games

Reviews on [ChessScout](/) show where each game turned. If your losses keep coming late in the game, time management, not chess knowledge, is what's costing you.

${FREE_PRO}`,
  },
];
