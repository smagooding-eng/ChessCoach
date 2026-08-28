import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

export const sessionsTable = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

export const usersTable = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  passwordHash: varchar("password_hash"),
  authProvider: varchar("auth_provider").notNull().default("local"),
  googleId: varchar("google_id").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  chesscomUsername: varchar("chesscom_username"),
  lichessUsername: varchar("lichess_username"),
  isAdmin: boolean("is_admin").notNull().default(false),
  isPremiumOverride: boolean("is_premium_override").notNull().default(false),
  emailVerified: boolean("email_verified").notNull().default(false),
  emailVerificationToken: varchar("email_verification_token"),
  emailVerificationExpires: timestamp("email_verification_expires", { withTimezone: true }),
  inviteCode: varchar("invite_code").unique(),
  referredByUserId: varchar("referred_by_user_id"),
  // Affiliate commission program -- any user can be marked an affiliate,
  // so this scales to more affiliates later without schema changes.
  // isAffiliate gates whether their referral conversions earn commission
  // at all. commissionTiers is a list like
  // [{ maxDaysSinceSignup: 30, cents: 100 }, { maxDaysSinceSignup: 60, cents: 50 }]
  // meaning: if the referred user subscribes within 30 days of THEIR
  // OWN signup, the referrer earns $1.00; within 60 days, $0.50; beyond
  // the last tier's window, $0. A flat, no-decay rate is just a single
  // tier with a large maxDaysSinceSignup. affiliateProgramEndsAt is a
  // separate, optional cutoff for the affiliate deal overall (e.g. "this
  // arrangement stops earning new commissions after this date"),
  // independent of the per-referred-user decay above.
  isAffiliate: boolean("is_affiliate").notNull().default(false),
  affiliateCommissionTiers: jsonb("affiliate_commission_tiers").$type<{ maxDaysSinceSignup: number; cents: number }[]>(),
  affiliateProgramEndsAt: timestamp("affiliate_program_ends_at", { withTimezone: true }),
  // Stripe Connect Express account -- created once the affiliate starts
  // onboarding, used as the destination for actual payout transfers.
  stripeConnectAccountId: varchar("stripe_connect_account_id"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const referralConversionsTable = pgTable("referral_conversions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  referrerUserId: varchar("referrer_user_id").notNull(),
  referredUserId: varchar("referred_user_id").notNull(),
  status: varchar("status").notNull().default("signed_up"),
  convertedAt: timestamp("converted_at", { withTimezone: true }),
  // Set once, at the moment status flips to "converted", based on the
  // referrer's affiliate tiers and how many days had passed since the
  // referred user's own signup. Null means either the referrer isn't an
  // affiliate, or this conversion fell outside every tier (earned $0).
  // Stored as a fixed snapshot rather than computed live, so it doesn't
  // silently change if the affiliate's tiers are edited later.
  commissionOwedCents: integer("commission_owed_cents"),
  commissionPaidAt: timestamp("commission_paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_referral_referrer").on(table.referrerUserId),
  index("idx_referral_referred").on(table.referredUserId),
]);

export const pageViewsTable = pgTable("page_views", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  path: varchar("path").notNull(),
  userId: varchar("user_id"),
  visitorId: varchar("visitor_id"),
  ipAddress: varchar("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Manual commission adjustments -- for correcting an auto-calculated
// amount or adding a one-off bonus, without erasing the original
// tier-calculated snapshot on the conversion itself. Positive cents adds
// to what's owed, negative subtracts. Kept as its own audit trail
// (who/when/why) rather than mutating referralConversionsTable in
// place, so there's always a record of what was manually changed and
// why.
export const affiliateAdjustmentsTable = pgTable("affiliate_adjustments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  affiliateUserId: varchar("affiliate_user_id").notNull(),
  cents: integer("cents").notNull(),
  reason: varchar("reason"),
  createdByUserId: varchar("created_by_user_id"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_affiliate_adjustments_affiliate").on(table.affiliateUserId),
]);

export type UpsertUser = typeof usersTable.$inferInsert;
export type User = typeof usersTable.$inferSelect;
export type ReferralConversion = typeof referralConversionsTable.$inferSelect;
