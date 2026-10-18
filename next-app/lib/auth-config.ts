import GitHubProvider from 'next-auth/providers/github';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { getPrisma } from '@/lib/prisma';
import { ensureUserOnboarding } from '@/lib/user-onboarding';
import { validatePassword } from '@/lib/password-validation';
import { passwordVersion } from '@/lib/password-reset';
import bcrypt from 'bcryptjs';
import type { NextAuthOptions } from 'next-auth';
import {
  checkRateLimit,
  clientIpFromHeaders,
  hitRateLimit,
  resetRateLimit,
  type RateLimitRule,
} from '@/lib/rate-limit';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Every credential attempt counts against the client address; only failed attempts count against an email.
const AUTH_IP_RULE: RateLimitRule = { limit: 100, windowMs: 15 * 60 * 1000 };
const AUTH_FAILURE_RULE: RateLimitRule = { limit: 5, windowMs: 15 * 60 * 1000 };
const SIGNUP_FAILED_MESSAGE =
  'Unable to create an account with these details. If you already have one, sign in instead.';

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

function tooManyAttemptsError(retryAfterSec: number): Error {
  const minutes = Math.ceil(retryAfterSec / 60);
  return new Error(`Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
}

// Lets unknown-email logins take as long as wrong-password logins, so response time doesn't reveal accounts.
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHashPromise ??= bcrypt.hash('unused-placeholder-password', 12);
  return dummyHashPromise;
}

function isNextBuildPhase(): boolean {
  return process.env.NEXT_PHASE === 'phase-production-build';
}

function buildAuthOptions(): NextAuthOptions {
  const options: NextAuthOptions = {
    providers: [
      ...(process.env.GITHUB_ID?.trim() && process.env.GITHUB_SECRET?.trim() ? [GitHubProvider({
        clientId: process.env.GITHUB_ID ?? '',
        clientSecret: process.env.GITHUB_SECRET ?? '',
      })] : []),

      ...(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim() ? [GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID ?? '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      })] : []),

      CredentialsProvider({
        name: 'Email',
        credentials: {
          email:    { label: 'Email',    type: 'email'    },
          password: { label: 'Password', type: 'password' },
          isSignUp: { label: 'Sign Up',  type: 'text'     },
        },
        async authorize(credentials, req) {
          if (!credentials?.email || !credentials?.password) {
            throw new Error('Email and password are required');
          }

          const ipCheck = hitRateLimit(
            `auth-ip:${clientIpFromHeaders(req?.headers)}`,
            AUTH_IP_RULE,
          );
          if (!ipCheck.allowed) throw tooManyAttemptsError(ipCheck.retryAfterSec);

          const email = normalizeEmail(credentials.email);
          if (!EMAIL_REGEX.test(email)) {
            throw new Error('Invalid email format');
          }

          const failureKey = `auth-email:${email}`;
          const lockCheck = checkRateLimit(failureKey, AUTH_FAILURE_RULE);
          if (!lockCheck.allowed) throw tooManyAttemptsError(lockCheck.retryAfterSec);

          const passwordResult = validatePassword(credentials.password, credentials.isSignUp === 'true');
          if (!passwordResult.ok) throw new Error(passwordResult.error);

          const prisma = getPrisma();
          const authenticatedAt = Date.now();

          if (credentials.isSignUp === 'true') {
            // Hash before the lookup so an existing account costs the same time as a new one.
            const hash = await bcrypt.hash(passwordResult.value, 12);
            const existing = await prisma.user.findUnique({ where: { email } });
            if (existing) {
              hitRateLimit(failureKey, AUTH_FAILURE_RULE);
              throw new Error(SIGNUP_FAILED_MESSAGE);
            }

            const user = await prisma.user.create({
              data: {
                email,
                name: email.split('@')[0],
                password: hash,
              },
            });

            await ensureUserOnboarding(user.id);

            return {
              id:    user.id,
              email: user.email,
              name:  user.name,
              image: user.image,
              passwordVersion: passwordVersion(hash),
              authenticatedAt,
            };
          }

          const user = await prisma.user.findUnique({ where: { email } });

          const passwordMatch = await bcrypt.compare(
            passwordResult.value,
            user?.password ?? (await getDummyHash()),
          );
          if (!user?.password || !passwordMatch) {
            hitRateLimit(failureKey, AUTH_FAILURE_RULE);
            throw new Error('Invalid email or password');
          }

          resetRateLimit(failureKey);

          return {
            id:    user.id,
            email: user.email,
            name:  user.name,
            image: user.image,
            // Bind the session to the exact hash that passed bcrypt, including reset races.
            passwordVersion: passwordVersion(user.password),
            authenticatedAt,
          };
        },
      }),
    ],

    events: {
      async createUser({ user }) {
        if (user.id) await ensureUserOnboarding(user.id);
      },
    },

    callbacks: {
      async jwt({ token, user }) {
        if (user) {
          token.id = user.id;
          token.authenticatedAt = user.authenticatedAt ?? Date.now();
          if (user.passwordVersion) token.passwordVersion = user.passwordVersion;
          else delete token.passwordVersion;
        }
        const id = token.id || token.sub;
        if (!id) throw new Error('Session expired. Please sign in again.');
        const current = await getPrisma().user.findUnique({
          where: { id }, select: { password: true, passwordChangedAt: true },
        });
        const issuedAt = token.authenticatedAt ?? (typeof token.iat === 'number' ? token.iat * 1000 : 0);
        const invalidPassword = token.passwordVersion &&
          (!current?.password || token.passwordVersion !== passwordVersion(current.password));
        const invalidOlderSession = !token.passwordVersion && current?.passwordChangedAt &&
          issuedAt <= current.passwordChangedAt.getTime();
        if (!current || invalidPassword || invalidOlderSession) {
          // NextAuth clears the JWT cookie when this callback rejects an existing session.
          throw new Error('Session expired. Please sign in again.');
        }
        token.id = id;
        token.authenticatedAt = issuedAt;
        return token;
      },

      async session({ session, token }) {
        if (session.user && token.id) {
          session.user.id = token.id as string;
        }
        return session;
      },
    },

    pages: {
      signIn:  '/auth/signin',
    },

    session: {
      strategy: 'jwt',
      maxAge:   30 * 24 * 60 * 60,
    },

    secret: process.env.NEXTAUTH_SECRET,
    debug: process.env.NODE_ENV === 'development',
  };

  // Skip Prisma adapter during `next build` — avoids DB init at compile time.
  if (!isNextBuildPhase()) {
    options.adapter = PrismaAdapter(getPrisma());
  }

  return options;
}

let cachedAuthOptions: NextAuthOptions | undefined;

export function getAuthOptions(): NextAuthOptions {
  if (!cachedAuthOptions) {
    cachedAuthOptions = buildAuthOptions();
  }
  return cachedAuthOptions;
}

