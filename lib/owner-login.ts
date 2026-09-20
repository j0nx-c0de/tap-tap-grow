import { randomBytes } from "crypto";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { businesses, ownerLoginTokens } from "@/db/schema";
import { hashLoginSecret, loginSecretMatches } from "@/lib/auth";
import { generateOwnerLoginCode } from "@/lib/codes";
import { sendEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";
import { appUrl } from "@/lib/url";

type Db = ReturnType<typeof getDb>;
type Business = typeof businesses.$inferSelect;

export type LoginChannel = "email" | "sms";

// An emailed link is read whenever the owner gets round to their inbox; a
// texted code is typed within a minute or two of asking for it.
const TTL_MINUTES: Record<LoginChannel, number> = { email: 30, sms: 10 };

// /owner/[slug] is a public URL with a guessable slug, so the "text me a
// code" button is reachable by anyone. Unthrottled that's both a way to
// hammer an owner's phone and a way to spend someone else's Twilio balance.
const MAX_REQUESTS_PER_WINDOW = 5;
const THROTTLE_WINDOW_MINUTES = 15;

// 6 digits is a million possibilities; five guesses inside a ten-minute
// window makes working through them hopeless.
const MAX_ATTEMPTS = 5;

export type RequestResult =
  | { status: "sent"; channel: LoginChannel }
  | { status: "throttled" }
  | { status: "unavailable" };

function minutesAgo(n: number): Date {
  return new Date(Date.now() - n * 60_000);
}

// Enough of the destination to recognise, not enough to harvest — the
// sign-in page is public, so the full address never appears on it.
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return "•••";
  const head = user.slice(0, 1);
  return `${head}${"•".repeat(Math.max(2, user.length - 1))}@${domain}`;
}

export function maskPhone(phone: string): string {
  const last4 = phone.slice(-4);
  return `••• ••• ${last4}`;
}

export async function requestLogin(
  db: Db,
  business: Business,
  channel: LoginChannel,
): Promise<RequestResult> {
  const destination = channel === "email" ? business.ownerEmail : business.ownerPhone;
  if (!destination) return { status: "unavailable" };

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ownerLoginTokens)
    .where(
      and(
        eq(ownerLoginTokens.businessId, business.id),
        gte(ownerLoginTokens.createdAt, minutesAgo(THROTTLE_WINDOW_MINUTES)),
      ),
    );
  if (count >= MAX_REQUESTS_PER_WINDOW) return { status: "throttled" };

  // The emailed secret rides in a URL and is never typed, so it can be as
  // long as we like; the texted one has to be readable off a notification.
  const secret = channel === "email" ? randomBytes(32).toString("hex") : generateOwnerLoginCode();

  await db.insert(ownerLoginTokens).values({
    businessId: business.id,
    channel,
    secretHash: hashLoginSecret(secret),
    expiresAt: new Date(Date.now() + TTL_MINUTES[channel] * 60_000),
  });

  const dashboardUrl = appUrl(`/owner/${business.slug}`);

  if (channel === "email") {
    const link = appUrl(`/owner/${business.slug}/verify?token=${secret}`);
    const result = await sendEmail(
      destination,
      `Your ${business.name} dashboard link`,
      `<p>Here's your sign-in link for ${business.name}'s Tap Tap Grow dashboard:</p>
       <p><a href="${link}">${link}</a></p>
       <p>It works once and expires in ${TTL_MINUTES.email} minutes. Once you're in, bookmark
       <a href="${dashboardUrl}">${dashboardUrl}</a> — you'll stay signed in.</p>`,
    );
    // sendEmail's console fallback logs the recipient and subject but never
    // the body, and only the hash of this secret reaches the database — so
    // without this the link would exist nowhere recoverable while running
    // against the fallback. Can't fire once real credentials are set.
    if (result.simulated) console.log(`[owner-login:simulated] ${link}`);
  } else {
    const result = await sendSms(
      destination,
      `Your ${business.name} dashboard code is ${secret}. It expires in ${TTL_MINUTES.sms} minutes.`,
      business.smsFromNumber,
    );
    if (result.simulated) console.log(`[owner-login:simulated] code ${secret}`);
  }

  return { status: "sent", channel };
}

export type ConsumeResult = { ok: true } | { ok: false; reason: "invalid" | "locked" };

// Verifies a secret against this business's live tokens for that channel and
// burns it on success. Failure is deliberately vague to the caller's caller:
// the sign-in screen shouldn't distinguish "wrong code" from "expired code"
// for someone guessing.
export async function consumeToken(
  db: Db,
  businessId: string,
  channel: LoginChannel,
  secret: string,
): Promise<ConsumeResult> {
  const live = await db
    .select()
    .from(ownerLoginTokens)
    .where(
      and(
        eq(ownerLoginTokens.businessId, businessId),
        eq(ownerLoginTokens.channel, channel),
        isNull(ownerLoginTokens.consumedAt),
        gte(ownerLoginTokens.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(ownerLoginTokens.createdAt));

  const match = live.find((t) => loginSecretMatches(secret, t.secretHash));

  if (!match) {
    // Count the miss against the newest outstanding token, and retire it
    // once the guesses run out, so a wrong code can't be ground down.
    const newest = live[0];
    if (newest) {
      const attempts = newest.attempts + 1;
      await db
        .update(ownerLoginTokens)
        .set({ attempts, consumedAt: attempts >= MAX_ATTEMPTS ? new Date() : null })
        .where(eq(ownerLoginTokens.id, newest.id));
      if (attempts >= MAX_ATTEMPTS) return { ok: false, reason: "locked" };
    }
    return { ok: false, reason: "invalid" };
  }

  if (match.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "locked" };

  await db
    .update(ownerLoginTokens)
    .set({ consumedAt: new Date() })
    .where(eq(ownerLoginTokens.id, match.id));

  return { ok: true };
}
