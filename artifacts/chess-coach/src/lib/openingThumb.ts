// Decorative opening artwork (supplied set of six), picked deterministically from
// the opening's name. Shared by the Openings page and the Opening Trainer tiles on
// the Practice page so the same opening always shows the same picture.
export function openingThumb(name: string): string {
  const n = [...name].reduce((acc, c) => acc + c.charCodeAt(0), 0) % 6;
  return `${import.meta.env.BASE_URL}assets/openings/thumb-${n}.webp`;
}

// "Italian Game (Giuoco Piano)" / "Sicilian Defense — Najdorf" -> base family name,
// so a trainer line lands on the same artwork as the family in the Openings list.
export function openingFamily(name: string): string {
  return name.split(/\s+[—–-]\s+|\s*\(|:/)[0].trim();
}
