import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    passwordVersion?: string;
    authenticatedAt?: number;
  }
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    passwordVersion?: string;
    authenticatedAt?: number;
  }
}
