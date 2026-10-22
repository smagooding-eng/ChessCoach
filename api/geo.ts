import type { VercelRequest, VercelResponse } from '@vercel/node';

// chessscout.net/api/geo: the visitor's approximate country, region, city
// and time zone, from Vercel's own location headers (worked out from the
// connection, no outside service). The app calls this once per visit and
// passes it to the API with its page tracking, so Admin can show where
// members are and when they're usually on.
const h = (req: VercelRequest, k: string) => {
  const v = req.headers[k];
  const s = Array.isArray(v) ? v[0] : v;
  if (!s) return null;
  try { return decodeURIComponent(s).slice(0, 80); } catch { return s.slice(0, 80); }
};

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.status(200).json({
    country: h(req, 'x-vercel-ip-country'),
    region: h(req, 'x-vercel-ip-country-region'),
    city: h(req, 'x-vercel-ip-city'),
    timezone: h(req, 'x-vercel-ip-timezone'),
  });
}
