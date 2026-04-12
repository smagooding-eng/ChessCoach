import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function normalizeFen(fen: string): string {
  if (!fen) return fen;
  const parts = fen.split(' ');
  if (parts.length < 3) return fen;

  const castling = parts[2];
  if (!castling || castling === '-' || /^[KQkq]+$/.test(castling)) return fen;

  if (!/^[A-Ha-h]+$/.test(castling)) return fen;

  const ranks = parts[0].split('/');
  const whiteBack = ranks[7] || '';
  const blackBack = ranks[0] || '';

  function findKingFile(rank: string): number {
    let file = 0;
    for (const ch of rank) {
      if (ch >= '1' && ch <= '8') { file += parseInt(ch); }
      else { if (ch === 'K' || ch === 'k') return file; file++; }
    }
    return -1;
  }

  const wKingFile = findKingFile(whiteBack);
  const bKingFile = findKingFile(blackBack);

  let result = '';
  for (const ch of castling) {
    const file = ch.toLowerCase().charCodeAt(0) - 97;
    if (ch >= 'A' && ch <= 'H') {
      result += file > wKingFile ? 'K' : 'Q';
    } else {
      result += file > bKingFile ? 'k' : 'q';
    }
  }

  const order = (s: string) => {
    const arr = s.split('');
    arr.sort((a, b) => 'KQkq'.indexOf(a) - 'KQkq'.indexOf(b));
    return arr.join('');
  };

  parts[2] = order(result);
  return parts.join(' ');
}
