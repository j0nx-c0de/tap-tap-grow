import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { businesses, contacts, punchCards } from "@/db/schema";

export default async function ContactsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const [business] = await db.select().from(businesses).where(eq(businesses.id, id)).limit(1);
  if (!business) notFound();

  const rows = await db
    .select({ contact: contacts, punchCard: punchCards })
    .from(contacts)
    .leftJoin(punchCards, eq(punchCards.contactId, contacts.id))
    .where(eq(contacts.businessId, id))
    .orderBy(desc(contacts.createdAt));

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link href={`/admin/businesses/${id}`} className="text-sm text-muted hover:text-foreground">
        ← {business.name}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Contacts</h1>
      <p className="mt-1 text-sm text-muted">
        Who&apos;s opted into what, and how far along their punch card is.
      </p>

      {rows.length === 0 ? (
        <p className="mt-8 text-muted">No contacts yet.</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Texts</th>
                <th className="px-4 py-3 font-medium">Email opt-in</th>
                {business.rewardMode === "punch_card" && <th className="px-4 py-3 font-medium">Stamps</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ contact, punchCard }) => (
                <tr key={contact.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">{contact.name || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{contact.phone}</td>
                  <td className="px-4 py-3">{contact.email || "—"}</td>
                  <td className="px-4 py-3">
                    <OptBadge on={contact.smsOptIn} />
                  </td>
                  <td className="px-4 py-3">
                    <OptBadge on={contact.emailOptIn} />
                  </td>
                  {business.rewardMode === "punch_card" && (
                    <td className="px-4 py-3">
                      {punchCard?.stampCount ?? 0} / {business.punchGoal}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OptBadge({ on }: { on: boolean }) {
  return (
    <span className={on ? "text-accent" : "text-muted"}>{on ? "✓ opted in" : "—"}</span>
  );
}
