// Decorative opening artwork (supplied set of six), picked deterministically from
// the opening's name. Shared by the Openings page and the Opening Trainer tiles on
// the Practice page so the same opening always shows the same picture.
// With the admin photo toggle on, a larger set of twelve real photographs is
// used instead (public/photo/assets/openings/thumb-0..11.webp).
export const PHOTO_THUMB_COUNT = 12;
export function openingThumb(name: string, photo = false): string {
  const sum = [...name].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  if (photo) return `${import.meta.env.BASE_URL}photo/assets/openings/thumb-${sum % PHOTO_THUMB_COUNT}.webp`;
  return `${import.meta.env.BASE_URL}assets/openings/thumb-${sum % 6}.webp`;
}

// "Italian Game (Giuoco Piano)" / "Sicilian Defense — Najdorf" -> base family name,
// so a trainer line lands on the same artwork as the family in the Openings list.
export function openingFamily(name: string): string {
  return name.split(/\s+[—–-]\s+|\s*\(|:/)[0].trim();
}

// Thumbnails for a whole list, top to bottom. Each row still starts from its
// opening's own picture, but if that picture was used in any of the previous
// few rows it moves on to the next free one -- so the same image never shows
// twice in a row (or close together) in a list.
export function openingThumbList(names: string[], photo = false): string[] {
  const n = photo ? PHOTO_THUMB_COUNT : 6;
  const window = Math.min(4, n - 1);
  const recent: number[] = [];
  return names.map((name) => {
    let idx = [...name].reduce((acc, c) => acc + c.charCodeAt(0), 0) % n;
    for (let tries = 0; tries < n && recent.includes(idx); tries++) idx = (idx + 1) % n;
    recent.push(idx);
    if (recent.length > window) recent.shift();
    return photo
      ? `${import.meta.env.BASE_URL}photo/assets/openings/thumb-${idx}.webp`
      : `${import.meta.env.BASE_URL}assets/openings/thumb-${idx}.webp`;
  });
}
