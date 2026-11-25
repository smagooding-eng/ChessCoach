// The ChessScout extension for Chrome (Chess.com: "review this game" after every game).
export const EXTENSION_URL = 'https://chromewebstore.google.com/detail/hebbonhdppancbikdmclokijiofdfmfj';

/** Desktop Chrome, Edge, Brave or Opera: the browsers that can install it (not phones, not Safari/Firefox). */
export function canInstallExtension(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return false;
  if (/Firefox\//.test(ua)) return false;
  return /Chrome\/|Chromium\/|Edg\//.test(ua);
}
const KEY = 'cs_extension_card_hidden';
export const extensionCardHidden = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
export const hideExtensionCard = () => { try { localStorage.setItem(KEY, '1'); } catch { /* */ } };
