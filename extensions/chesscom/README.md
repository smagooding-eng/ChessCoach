# ChessScout for Chess.com (browser extension)

Adds a "Review this game free" button to Chess.com once a game is over. The button opens
`https://chessscout.net/cc/<gameId>`, which brings the game into the member's ChessScout
games and opens its review (waiting for Chess.com to publish the game if needed).

- No permissions beyond running on www.chess.com: no tabs, storage, history or cookies.
- Shows only on Chess.com's game-over screen or a finished game; never during play.
- Sends nothing until clicked.

## Try it before publishing
1. Chrome → `chrome://extensions` (Edge: `edge://extensions`) → turn on **Developer mode**.
2. **Load unpacked** → choose this `extensions/chesscom` folder.
3. Play or open a finished game on chess.com.

## Publish
Zip the *contents* of this folder (manifest.json at the zip's top level) and upload it in
the Chrome Web Store Developer Dashboard. The same zip works for Microsoft Edge Add-ons.
Privacy policy: https://chessscout.net/privacy.html
