/** Did the user play White in this game? Every stored game records whose
 *  game it is (`username`, the imported/played account), so that decides
 *  it; the user's known account names are only a fallback. */
export function playedWhite(
  game: { username?: string | null; whiteUsername?: string | null; blackUsername?: string | null },
  mine: string[] = [],
): boolean {
  const me = (game.username ?? '').toLowerCase();
  const w = (game.whiteUsername ?? '').toLowerCase();
  const b = (game.blackUsername ?? '').toLowerCase();
  if (me) {
    if (me === w) return true;
    if (me === b) return false;
  }
  if (mine.includes(w)) return true;
  if (mine.includes(b)) return false;
  return true;
}
