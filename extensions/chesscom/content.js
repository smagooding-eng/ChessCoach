// ChessScout for Chess.com: once a game is over, a "Review free on ChessScout" button.
//
// Fair play: the button only appears when Chess.com itself is showing its game-over
// screen or a finished game (a result like 1-0 in the move list). It never reads the
// moves, never shows anything during a game, and sends nothing anywhere until it's
// clicked; the click opens ChessScout in a new tab with the game's id.
(() => {
  const SITE = 'https://chessscout.net';
  const BTN = 'chessscout-review';
  const NAME = /^[A-Za-z0-9_-]{3,25}$/;
  let shownKey = null;
  let dismissedKey = null;
  let overSince = 0;

  const GAME_OVER = [
    '.game-over-modal-content',
    '.game-over-modal-container',
    '[class*="game-over-modal"]',
    '[data-cy="game-over-modal"]',
    '.game-over-header-component',
  ];
  const visible = (el) => !!el && el.getClientRects().length > 0;

  function gameOver() {
    for (const s of GAME_OVER) if (visible(document.querySelector(s))) return true;
    for (const el of document.querySelectorAll('.game-result, [class*="game-result"]')) {
      if (visible(el) && /^\s*(1-0|0-1|½-½|1\/2-1\/2)\s*$/.test(el.textContent || '')) return true;
    }
    return false;
  }

  function gameId() {
    const m = location.pathname.match(/^\/(?:analysis\/)?game\/(?:live\/|daily\/)?(\d{4,15})(?:[/?#]|$)/);
    if (m) return m[1];
    // On the play page the finished game's link sits in the game-over screen
    for (const a of document.querySelectorAll('a[href*="/game/"]')) {
      const h = a.getAttribute('href') || '';
      const x = h.match(/\/game\/(?:live\/|daily\/)?(\d{4,15})(?:[/?#]|$)/);
      if (x && visible(a)) return x[1];
    }
    return null;
  }

  function players() {
    const found = [];
    for (const el of document.querySelectorAll('[data-test-element="user-tagline-username"], .user-username-component, .cc-user-username-component')) {
      const n = (el.textContent || '').trim();
      if (NAME.test(n) && !found.includes(n)) found.push(n);
      if (found.length === 2) break;
    }
    return found;
  }

  function show(key, id) {
    if (document.getElementById(BTN)) return;
    const p = players();
    const url = id
      ? `${SITE}/cc/${id}${p.length ? `?p=${encodeURIComponent(p.join(','))}` : ''}`
      : `${SITE}/cc/latest?s=${overSince}`;
    const box = document.createElement('div');
    box.id = BTN;
    box.innerHTML = `
      <a class="csx-go" href="${url}" target="_blank" rel="noopener">
        <img src="${chrome.runtime.getURL('icons/icon-48.png')}" alt="" />
        <span><b>Review this game free</b><small>Every move graded on ChessScout</small></span>
      </a>
      <button class="csx-x" type="button" aria-label="Hide">×</button>`;
    box.querySelector('.csx-x').addEventListener('click', () => { dismissedKey = key; hide(); });
    document.body.appendChild(box);
    shownKey = key;
  }

  function hide() {
    document.getElementById(BTN)?.remove();
    shownKey = null;
  }

  function check() {
    if (!gameOver()) {
      overSince = 0;
      if (shownKey) hide();
      return;
    }
    if (!overSince) overSince = Date.now();
    const id = gameId();
    const key = id || `play:${overSince}`;
    if (key === dismissedKey) return;
    if (shownKey && shownKey !== key) hide();
    if (!shownKey) show(key, id);
  }

  setInterval(check, 1000);
})();
