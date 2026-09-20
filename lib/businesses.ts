import { desc, eq, ilike, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { businesses, contacts, redemptions } from "@/db/schema";
import { formatAddressLine } from "@/lib/address";

type Db = ReturnType<typeof getDb>;

export type BusinessListRow = {
  id: string;
  name: string;
  slug: string;
  // Pre-formatted here rather than in the page: the list, the command palette,
  // and anything else showing a business next to its address should agree on
  // what one line of it looks like. Empty string for rows created before
  // addresses were collected.
  addressLine: string;
  contactCount: number;
  pendingCount: number;
};

export type RelatedBusiness = { id: string; name: string; addressLine: string };

// Punctuation, case, and the filler words a sign uses but a database row
// doesn't ("Joe's Pizza Co. LLC" vs "Joes Pizza") all have to fall away before
// two names can be compared.
const nameKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|a|llc|inc|co|company|corp)\b/g, " ")
    .trim()
    .replace(/\s+/g, " ");

// Other rows whose name is the same or a near-miss — the second half of what
// the address is for. Two hits mean either a chain's second location or a
// competitor trading on the name, and the caller shows their addresses so the
// operator can tell which without leaving the page.
//
// Done in JS over every business rather than in SQL: the comparison is a
// normalization no index could serve, and this list is one operator's
// door-to-door book, not a public directory.
export async function findSimilarBusinesses(
  db: Db,
  business: { id: string; name: string },
): Promise<RelatedBusiness[]> {
  const key = nameKey(business.name);
  if (!key) return [];

  const rows = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      addressLine1: businesses.addressLine1,
      addressLine2: businesses.addressLine2,
      city: businesses.city,
      state: businesses.state,
      postalCode: businesses.postalCode,
    })
    .from(businesses)
    .where(ne(businesses.id, business.id))
    .orderBy(desc(businesses.createdAt));

  return rows
    .filter((r) => {
      const other = nameKey(r.name);
      return !!other && (other === key || other.includes(key) || key.includes(other));
    })
    .map((r) => ({ id: r.id, name: r.name, addressLine: formatAddressLine(r) }));
}

// Two grouped aggregate queries instead of a $count pair per business — that
// was 2N round trips (N businesses × [contactCount, pendingCount]), the same
// shape the dashboard rollup had before it got the same fix.
export async function searchBusinesses(db: Db, query: string | undefined): Promise<BusinessListRow[]> {
  const trimmed = query?.trim();
  // Address is searchable, not just displayed — "which of the three Joe's
  // Pizzas is the one on Main St?" is the question this list has to answer,
  // and typing a street, city, or ZIP is the fastest way to ask it.
  const filter = trimmed
    ? or(
        ilike(businesses.name, `%${trimmed}%`),
        ilike(businesses.slug, `%${trimmed}%`),
        ilike(businesses.addressLine1, `%${trimmed}%`),
        ilike(businesses.city, `%${trimmed}%`),
        ilike(businesses.state, `%${trimmed}%`),
        ilike(businesses.postalCode, `%${trimmed}%`),
      )
    : undefined;

  const [list, contactRows, pendingRows] = await Promise.all([
    db
      .select({
        id: businesses.id,
        name: businesses.name,
        slug: businesses.slug,
        addressLine1: businesses.addressLine1,
        addressLine2: businesses.addressLine2,
        city: businesses.city,
        state: businesses.state,
        postalCode: businesses.postalCode,
      })
      .from(businesses)
      .where(filter)
      .orderBy(desc(businesses.createdAt)),
    db
      .select({ businessId: contacts.businessId, count: sql<number>`count(*)::int` })
      .from(contacts)
      .groupBy(contacts.businessId),
    db
      .select({ businessId: redemptions.businessId, count: sql<number>`count(*)::int` })
      .from(redemptions)
      .where(eq(redemptions.status, "pending"))
      .groupBy(redemptions.businessId),
  ]);

  const byBusiness = (rows: { businessId: string; count: number }[]) => new Map(rows.map((r) => [r.businessId, r.count]));
  const contactByBiz = byBusiness(contactRows);
  const pendingByBiz = byBusiness(pendingRows);

  return list.map((b) => ({
    id: b.id,
    name: b.name,
    slug: b.slug,
    addressLine: formatAddressLine(b),
    contactCount: contactByBiz.get(b.id) ?? 0,
    pendingCount: pendingByBiz.get(b.id) ?? 0,
  }));
}
