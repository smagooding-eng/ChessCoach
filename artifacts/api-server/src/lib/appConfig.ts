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
