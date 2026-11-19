// Save a file the app made. On a computer: the browser's normal download. On a phone (the
// Android app, the iPhone home-screen app, or a phone browser) that in-page download is
// often dropped without a word, so the file goes to the server for a moment and the phone
// opens a one-time link to it on chessscout.net: an ordinary download its own download
// manager (Android) or Files (iPhone) saves. See api-server routes/downloads.ts.
import { apiFetch } from '@/lib/api';

function onPhone(): boolean {
  if (typeof window === 'undefined') return false;
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function browserDownload(f: File) {
  const url = URL.createObjectURL(f);
  const a = document.createElement('a');
  a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function toBase64(f: File): Promise<string> {
  const bytes = new Uint8Array(await f.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** 'download': the browser saved it. 'link': the phone is downloading it from a one-time link. */
export async function saveFile(f: File): Promise<'download' | 'link'> {
  if (!onPhone()) { browserDownload(f); return 'download'; }
  const isText = f.type.startsWith('text/') || /json|csv|xml/.test(f.type);
  const body = isText ? { name: f.name, type: f.type || 'application/octet-stream', text: await f.text() }
    : { name: f.name, type: f.type || 'application/octet-stream', base64: await toBase64(f) };
  try {
    const r = await apiFetch('/api/downloads', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => null) as { path?: string } | null;
    if (!r.ok || !d?.path) throw new Error('no link');
    window.location.assign(d.path); // an attachment: the page stays, the phone saves the file
    return 'link';
  } catch {
    browserDownload(f); // best effort
    return 'download';
  }
}
