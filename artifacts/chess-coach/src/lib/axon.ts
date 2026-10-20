// AppLovin Axon pixel (loaded from index.html). Small helper so pages can
// send events without caring whether the pixel loaded. It's never loaded on
// Chess for Kids pages or in Kid Mode, so nothing is tracked for children.

declare global {
  interface Window { axon?: (...args: unknown[]) => void }
}

export function axonTrack(event: string, data: Record<string, unknown> = {}) {
  try { window.axon?.('track', event, data); } catch { /* pixel blocked or not loaded */ }
}
