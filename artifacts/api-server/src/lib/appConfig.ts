import { db, appConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function getConfigValue(key: string): Promise<string | null> {
  const [row] = await db.select().from(appConfigTable).where(eq(appConfigTable.key, key));
  return row?.value ?? null;
}

async function setConfigValue(key: string, value: string, updatedBy?: string): Promise<void> {
  const existing = await db.select().from(appConfigTable).where(eq(appConfigTable.key, key));
  if (existing.length > 0) {
    await db.update(appConfigTable).set({ value, updatedAt: new Date(), updatedBy: updatedBy ?? null }).where(eq(appConfigTable.key, key));
  } else {
    await db.insert(appConfigTable).values({ key, value, updatedBy: updatedBy ?? null });
  }
}

const DASHBOARD_REDESIGN_KEY = "dashboard_redesign_enabled";

// Defaults to false (the current design) for anyone -- including every
// existing user -- until an admin explicitly turns it on. This is a
// single global value every client reads identically; it is NOT a
// per-account preference, which is what the SettingsContext.tsx-based
// toggle used to be before this replaced it.
export async function isDashboardRedesignEnabled(): Promise<boolean> {
  const value = await getConfigValue(DASHBOARD_REDESIGN_KEY);
  return value === "true";
}

export async function setDashboardRedesignEnabled(enabled: boolean, adminUserId: string): Promise<void> {
  await setConfigValue(DASHBOARD_REDESIGN_KEY, enabled ? "true" : "false", adminUserId);
}

const PHOTO_IMAGES_KEY = "photo_images_enabled";

// Admin toggle: swap the app's AI-generated artwork for real chess photography.
// Global (same for everyone), defaults to off (AI artwork) until an admin flips it.
export async function isPhotoImagesEnabled(): Promise<boolean> {
  return (await getConfigValue(PHOTO_IMAGES_KEY)) === "true";
}

export async function setPhotoImagesEnabled(enabled: boolean, adminUserId: string): Promise<void> {
  await setConfigValue(PHOTO_IMAGES_KEY, enabled ? "true" : "false", adminUserId);
}

const DEFAULT_LOOK_KEY = "default_look";

// Admin-chosen starting look (pieces, board, background theme) for everyone.
// It only fills in what a user hasn't picked themselves -- the app applies
// it per field, client side, and never overwrites a user's own choice.
export type DefaultLook = Partial<Record<"pieceShape" | "pieceStyle" | "boardTheme" | "boardTexture" | "uiStyle" | "bgPhoto" | "cardGlass" | "appBackground", string>>;
const LOOK_FIELDS = ["pieceShape", "pieceStyle", "boardTheme", "boardTexture", "uiStyle", "bgPhoto", "cardGlass", "appBackground"] as const;

export function cleanDefaultLook(input: unknown): DefaultLook {
  const out: DefaultLook = {};
  if (!input || typeof input !== "object") return out;
  for (const k of LOOK_FIELDS) {
    const v = (input as Record<string, unknown>)[k];
    if (typeof v === "string" && v.length > 0 && v.length <= 64 && /^[\w-]+$/.test(v)) out[k] = v;
  }
  return out;
}

export async function getDefaultLook(): Promise<DefaultLook> {
  const raw = await getConfigValue(DEFAULT_LOOK_KEY);
  if (!raw) return {};
  try { return cleanDefaultLook(JSON.parse(raw)); } catch { return {}; }
}

export async function setDefaultLook(look: DefaultLook, adminUserId: string): Promise<DefaultLook> {
  const clean = cleanDefaultLook(look);
  await setConfigValue(DEFAULT_LOOK_KEY, JSON.stringify(clean), adminUserId);
  return clean;
}
