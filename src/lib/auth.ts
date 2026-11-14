import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { nextCookies } from "better-auth/next-js";

import { db } from "@/db";
import * as schema from "@/db/schema";

const googleWebClientId =
  process.env.GOOGLE_WEB_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
const googleWebClientSecret =
  process.env.GOOGLE_WEB_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
const googleAndroidClientId = process.env.GOOGLE_ANDROID_CLIENT_ID;

const googleClientIds = Array.from(
  new Set([googleWebClientId, googleAndroidClientId].filter(Boolean) as string[]),
);

export const auth = betterAuth({
  appName: "Lumen Notes",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"],
      requireLocalEmailVerified: false,
    },
  },
  ...(googleWebClientId && googleWebClientSecret
    ? {
        socialProviders: {
          google: {
            clientId:
              googleClientIds.length > 1 ? googleClientIds : googleWebClientId,
            clientSecret: googleWebClientSecret,
          },
        },
      }
    : {}),
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh once a day
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  user: {
    changeEmail: {
      enabled: false,
    },
  },
  // `nextCookies` must be the last plugin. It lets server actions set cookies.
  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
