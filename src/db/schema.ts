import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/* -------------------------------------------------------------------------- */
/*                            Better Auth schema                              */
/* -------------------------------------------------------------------------- */
/**
 * These tables match the Better Auth Drizzle adapter schema. Table and column
 * names are intentional: Better Auth looks them up by name.
 * https://www.better-auth.com/docs/concepts/database#core-schema
 */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified")
    .default(false)
    .notNull(),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

/* -------------------------------------------------------------------------- */
/*                                  Notes                                     */
/* -------------------------------------------------------------------------- */

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** Legacy plaintext Markdown source (used when encryptionVersion = 0). */
    content: text("content").notNull().default(""),
    /** AES-GCM ciphertext (base64) for note content when encrypted. */
    contentCiphertext: text("content_ciphertext"),
    /** AES-GCM IV (base64) for note content when encrypted. */
    contentIv: text("content_iv"),
    /** 0 = legacy plaintext, 1 = client-side E2EE. */
    encryptionVersion: integer("encryption_version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("notes_user_id_idx").on(table.userId),
    index("notes_updated_at_idx").on(table.updatedAt),
  ],
);

export const userEncryptionKeys = pgTable("user_encryption_key", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  /** Base64 salt for password KDF. */
  kdfSalt: text("kdf_salt").notNull(),
  /** PBKDF2 iterations. */
  kdfIterations: integer("kdf_iterations").notNull(),
  /** Wrapped DEK (base64). */
  wrappedDek: text("wrapped_dek").notNull(),
  /** IV for wrapped DEK (base64). */
  wrappedDekIv: text("wrapped_dek_iv").notNull(),
  /** Wrapped DEK using recovery-key-derived KEK (base64). */
  recoveryWrappedDek: text("recovery_wrapped_dek").notNull(),
  /** IV for recovery-wrapped DEK (base64). */
  recoveryWrappedDekIv: text("recovery_wrapped_dek_iv").notNull(),
  /** Encrypted verifier for password-unwrapped DEK (base64 ciphertext). */
  verifierCiphertext: text("verifier_ciphertext").notNull(),
  /** IV for verifier (base64). */
  verifierIv: text("verifier_iv").notNull(),
  keyVersion: integer("key_version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
export type NoteRow = typeof notes.$inferSelect;
export type UserEncryptionKeyRow = typeof userEncryptionKeys.$inferSelect;
