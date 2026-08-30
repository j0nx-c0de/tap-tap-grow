import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { getDb } from "@/db";
import { businesses, contacts, punchCards, punchTags, redemptions, tags } from "@/db/schema";
import { appUrl } from "@/lib/url";
import { BusinessForm } from "../../business-form";
import { addPunchTag, addTag, updateBusiness } from "../../actions";

export default async function EditBusinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const [business] = await db.select().from(businesses).where(eq(businesses.id, id)).limit(1);
  if (!business) notFound();

  const businessTags = await db
    .select()
    .from(tags)
    .where(eq(tags.businessId, id))
    .orderBy(asc(tags.createdAt));

  const tagsWithQr = await Promise.all(
    businessTags.map(async (tag) => {
      const url = appUrl(`/t/${tag.id}`);
      const qr = await QRCode.toDataURL(url, { margin: 1, width: 220 });
      return { ...tag, url, qr };
    }),
  );

  const contactCount = await db.$count(contacts, eq(contacts.businessId, id));
  const pendingCount = await db.$count(
    redemptions,
    and(eq(redemptions.businessId, id), eq(redemptions.status, "pending")),
  );
  const approvedCount = await db.$count(
    redemptions,
    and(eq(redemptions.businessId, id), eq(redemptions.status, "approved")),
  );
  const punchCardCount = await db.$count(punchCards, eq(punchCards.businessId, id));

  const businessPunchTags = await db
    .select()
    .from(punchTags)
    .where(eq(punchTags.businessId, id))
    .orderBy(asc(punchTags.createdAt));

  const updateAction = updateBusiness.bind(null, business.id);
  const addTagAction = addTag.bind(null, business.id);
  const addPunchTagAction = addPunchTag.bind(null, business.id);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/admin" className="text-sm text-muted hover:text-foreground">
        ← Businesses
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{business.name}</h1>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted">
        <Link href={`/admin/businesses/${business.id}/contacts`} className="text-accent hover:opacity-80">
          {contactCount} contacts →
        </Link>
        <span>{pendingCount} pending redemptions</span>
        <span>{approvedCount} approved redemptions</span>
        <span>{punchCardCount} active punch cards</span>
        <Link href={`/staff/${business.slug}`} className="text-accent hover:opacity-80">
          Staff console →
        </Link>
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Tap links</h2>
        <p className="mt-1 text-sm text-muted">
          Write each URL to an NFC tag (any free &quot;NFC Tools&quot; app), or use the QR code as a
          fallback. Every tag opens the same page — add more just for extra physical placements
          (front counter, patio, a table tent).
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {tagsWithQr.map((tag) => (
            <div key={tag.id} className="flex gap-4 rounded-xl border border-border bg-card p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={tag.qr}
                alt={`QR code for ${tag.label ?? "tap link"}`}
                width={96}
                height={96}
                className="h-24 w-24 shrink-0 rounded-lg border border-border bg-white p-1"
              />
              <div className="min-w-0">
                <p className="text-sm font-medium">{tag.label || "Tap link"}</p>
                <p className="mt-1 break-all font-mono text-xs text-muted">{tag.url}</p>
                <p className="mt-1 text-xs text-muted">
                  {tag.tapCount} {tag.tapCount === 1 ? "tap" : "taps"}
                </p>
              </div>
            </div>
          ))}
        </div>

        <form action={addTagAction} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Label for a new tag <span className="font-normal text-muted">(e.g. &quot;Patio&quot;)</span>
            <input
              name="label"
              required
              className="rounded-lg border border-border bg-background px-3 py-2 text-base outline-none focus:border-accent"
            />
          </label>
          <button
            type="submit"
            className="rounded-full border border-border px-5 py-2 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
          >
            Add tag
          </button>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Punch tags</h2>
        <p className="mt-1 text-sm text-muted">
          NTAG 424 DNA tags the business keeps. Every tap emits a one-time URL the
          chip signs itself, so a tap can&apos;t be faked, shared, or replayed from
          history &mdash; a tap is worth a stamp on its own, with no staff console
          step. Where the business sticks it sets the policy: on the counter means
          anyone who walks in, behind the counter means staff decide.
        </p>

        <div className="mt-4 flex flex-col gap-4">
          {businessPunchTags.length === 0 && (
            <p className="text-sm text-muted">None yet.</p>
          )}
          {businessPunchTags.map((pt) => (
            <div key={pt.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium">{pt.label || "Punch tag"}</p>
                <p className="text-xs text-muted">
                  {pt.tapCount} {pt.tapCount === 1 ? "tap" : "taps"} &middot;{" "}
                  {pt.uid ? `chip ${pt.uid}` : "chip not seen yet"} &middot; counter{" "}
                  {pt.lastCounter}
                </p>
              </div>

              <p className="mt-3 text-xs font-medium">URL template to write to the chip</p>
              <p className="mt-1 break-all rounded-lg bg-background p-2 font-mono text-xs text-muted">
                {appUrl(`/p/${pt.key}`)}
                ?picc_data=00000000000000000000000000000000&amp;cmac=0000000000000000
              </p>
              <p className="mt-1 text-xs text-muted">
                Configure the chip&apos;s SDM mirrors over the two placeholder values
                (encrypted PICC data, then CMAC).
              </p>

              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-medium text-accent">
                  Show AES keys to provision
                </summary>
                <div className="mt-2 flex flex-col gap-1 font-mono text-xs break-all text-muted">
                  <span>SDM Meta Read key: {pt.sdmMetaKey}</span>
                  <span>SDM File Read key: {pt.sdmFileKey}</span>
                </div>
                <p className="mt-2 text-xs text-muted">
                  Write these onto the chip as K_SDMMetaRead and K_SDMFileRead. They
                  never leave the server otherwise &mdash; a tap carries only what the
                  chip derives from them.
                </p>
              </details>
            </div>
          ))}
        </div>

        <form action={addPunchTagAction} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Label for a new punch tag{" "}
            <span className="font-normal text-muted">(e.g. &quot;Register disc&quot;)</span>
            <input
              name="label"
              required
              className="rounded-lg border border-border bg-background px-3 py-2 text-base outline-none focus:border-accent"
            />
          </label>
          <button
            type="submit"
            className="rounded-full border border-border px-5 py-2 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
          >
            Generate punch tag
          </button>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Settings</h2>
        <div className="mt-4">
          <BusinessForm
            action={updateAction}
            submitLabel="Save changes"
            initial={{
              name: business.name,
              slug: business.slug,
              googleReviewUrl: business.googleReviewUrl,
              yelpReviewUrl: business.yelpReviewUrl,
              facebookReviewUrl: business.facebookReviewUrl,
              instagramUrl: business.instagramUrl,
              tiktokUrl: business.tiktokUrl,
              redemptionMode: business.redemptionMode,
              rewardMode: business.rewardMode,
              rewardHeadline: business.rewardHeadline,
              rewardDescription: business.rewardDescription,
              punchGoal: business.punchGoal,
              punchCooldownMinutes: business.punchCooldownMinutes,
              staffPin: business.staffPin,
              smsEnabled: business.smsEnabled,
              smsFromNumber: business.smsFromNumber,
            }}
          />
        </div>
      </section>
    </div>
  );
}
