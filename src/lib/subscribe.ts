import { nanoid } from "nanoid";
import type { Subscriber } from "@prisma/client";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function feedUrl(token: string): string {
  return `${getEnv().APP_URL}/api/feeds/${token}`;
}

export type SubscribeResult = { kind: "ok"; created: boolean; subscriber: Subscriber } | { kind: "revoked" };

/**
 * Add an email to a show, or return the existing subscription unchanged.
 * A single INSERT … ON CONFLICT DO NOTHING makes concurrent duplicates converge on one row
 * with one token and one start date. Revoked subscribers are never reactivated here.
 */
export async function subscribe(input: {
  showId: string;
  email: string;
  name?: string | null;
  externalRef?: string | null;
}): Promise<SubscribeResult> {
  const email = normalizeEmail(input.email);
  const inserted = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO subscribers (id, show_id, email, name, feed_token, external_ref, start_date, status, created_at, updated_at)
    VALUES (${nanoid(25)}, ${input.showId}, ${email}, ${input.name ?? null}, ${nanoid(32)}, ${input.externalRef ?? null},
            now(), 'ACTIVE', now(), now())
    ON CONFLICT (show_id, email) DO NOTHING
    RETURNING id`;

  const subscriber = await db.subscriber.findUniqueOrThrow({
    where: { showId_email: { showId: input.showId, email } },
  });
  if (subscriber.status === "REVOKED") return { kind: "revoked" };
  return { kind: "ok", created: inserted.length === 1, subscriber };
}
