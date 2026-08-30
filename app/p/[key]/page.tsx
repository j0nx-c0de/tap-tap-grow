import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { businesses, contacts } from "@/db/schema";
import { Hub } from "@/app/t/[tagId]/hub";
import { getContactSession } from "@/lib/auth";
import { toPublicBusiness } from "@/lib/business";
import { loadHubData } from "@/lib/hub-data";
import { awardPunchTap, verifyPunchTap, type PunchAward } from "@/lib/punch-tag";

// Where a tap of the business's own NTAG 424 DNA tag lands. The chip rewrites
// this URL on every tap, so unlike /t/[tagId] it is single-use by
// construction — reopening it from history fails the counter check below.

const REASON_COPY: Record<string, { title: string; body: string }> = {
  unknown_tag: {
    title: "Tag not set up",
    body: "This tag isn't linked to a business yet. Ask staff to get in touch with whoever set it up.",
  },
  invalid: {
    title: "Couldn't verify that tap",
    body: "Try tapping the tag again, holding your phone still against it for a moment.",
  },
  wrong_chip: {
    title: "Couldn't verify that tap",
    body: "Try tapping the tag again, holding your phone still against it for a moment.",
  },
  replay: {
    title: "That tap was already used",
    body: "Each tap only counts once — this link can't be reused or shared. Tap the tag again to get a fresh one.",
  },
  missing: {
    title: "Nothing to verify",
    body: "Open this by tapping the tag with your phone rather than by following a saved link.",
  },
};

function TapProblem({ reason }: { reason: string }) {
  const copy = REASON_COPY[reason] ?? REASON_COPY.invalid;
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-balance">{copy.title}</h1>
        <p className="mt-3 text-sm text-muted">{copy.body}</p>
      </div>
    </main>
  );
}

export default async function PunchTapPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { key } = await params;
  const sp = await searchParams;

  // AN12196's default SUN template names these picc_data and cmac; the short
  // forms show up in some writer apps' presets.
  const pick = (...names: string[]): string => {
    for (const n of names) {
      const v = sp[n];
      if (typeof v === "string" && v.length > 0) return v;
    }
    return "";
  };
  const piccData = pick("picc_data", "piccData", "e");
  const cmac = pick("cmac", "c");

  if (!piccData || !cmac) return <TapProblem reason="missing" />;

  const verified = await verifyPunchTap(key, piccData, cmac);
  if (!verified.ok) return <TapProblem reason={verified.reason} />;

  const db = getDb();
  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, verified.businessId))
    .limit(1);
  if (!business) return <TapProblem reason="unknown_tag" />;

  const publicBusiness = toPublicBusiness(business);

  // Returning customer: their browser already knows who they are, so the tap
  // is the whole interaction — no form, no staff console, nothing to type.
  const contactId = await getContactSession(business.id);
  if (contactId) {
    const [contact] = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.businessId, business.id)))
      .limit(1);

    if (contact) {
      // A side effect during render is normally the wrong shape, but this page
      // is dynamic and the award is idempotent — `lastAwardedCounter` means a
      // re-render can't produce a second stamp.
      const award: PunchAward = await awardPunchTap(
        business.id,
        contact.id,
        verified.punchTagKey,
        verified.counter,
      );
      const hub = await loadHubData(db, business, contact);

      return (
        <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
          <Hub
            business={publicBusiness}
            tagId={null}
            initialHub={hub}
            initialPunchAward={award}
          />
        </main>
      );
    }
  }

  // First-timer. The tap is already verified and its counter burned; carrying
  // it through the identify step is what lets them still get credit for it.
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <Hub
        business={publicBusiness}
        tagId={null}
        punchTap={{ key: verified.punchTagKey, counter: verified.counter }}
      />
    </main>
  );
}
