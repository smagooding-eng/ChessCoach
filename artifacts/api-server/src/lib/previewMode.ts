// The preview server (api-preview.chessscout.net): the same code on a copy of the database,
// for trying changes before a release. PREVIEW_MODE=1 keeps it from touching real members or
// outside services: emails and phone notifications only go to PREVIEW_ALLOW_EMAILS (comma
// separated, e.g. Shann's address), and the jobs that act outside ChessScout don't start.
export const PREVIEW_MODE = process.env.PREVIEW_MODE === "1";
export const PREVIEW_ALLOW_EMAILS = new Set(
  (process.env.PREVIEW_ALLOW_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
);
export const previewAllowsEmail = (to: string) => !PREVIEW_MODE || PREVIEW_ALLOW_EMAILS.has(to.trim().toLowerCase());
