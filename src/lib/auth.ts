import { getIronSession, IronSession, SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";

export interface SessionData {
  isAuthenticated: boolean;
}

export const sessionOptions = (): SessionOptions => ({
  password: getEnv().SESSION_SECRET,
  cookieName: "ppa_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 1 week
  },
});

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions());
}

const sha256 = (s: string) => createHash("sha256").update(s).digest();

export async function login(password: string): Promise<boolean> {
  return timingSafeEqual(sha256(password), sha256(getEnv().ADMIN_PASSWORD));
}

export async function createSession(): Promise<void> {
  const session = await getSession();
  session.isAuthenticated = true;
  await session.save();
}

export async function destroySession(): Promise<void> {
  const session = await getSession();
  session.destroy();
}

export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();
  return session.isAuthenticated === true;
}
