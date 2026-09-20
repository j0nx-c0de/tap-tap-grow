import { ilike } from "drizzle-orm";
import { getDb } from "@/db";
import { businesses } from "@/db/schema";

type Db = ReturnType<typeof getDb>;

// The name as it appears on the sign, turned into the URL-safe half of a
// business's public links (/staff/<slug>, /owner/<slug>, /card/<slug>).
//
// The full admin form asks for the slug directly, because whoever fills that
// in is sitting down with time to think about it. This exists for the
// reviews-only quick add, which asks for a name and nothing else — a slug
// prompt on a doorstep is one field too many for something the customer
// never sees.
export function slugify(name: string): string {
  return (
    name
      // "Café" and "Cafe" should not be two different businesses.
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      // Spelled out rather than dropped: "Pizza & Wings" reads as
      // "pizza-and-wings", not "pizza-wings".
      .replace(/&/g, " and ")
      // Dropped rather than hyphenated, so "Joe's" is "joes", not "joe-s".
      .replace(/['‘’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      // The slice can land mid-separator.
      .replace(/-+$/, "")
  );
}

// `slugify` with a numeric suffix added until nothing else holds the name.
// Two locations of the same chain are the ordinary case here, not an edge
// one — "joes-pizza" and "joes-pizza-2" is the right outcome.
//
// The unique constraint on businesses.slug is still the real guarantee; this
// only keeps the common case from hitting it. A race would have to be two
// simultaneous quick adds of the same name by the one operator holding the
// admin password, and the caller reports the constraint error if it happens.
export async function uniqueBusinessSlug(db: Db, name: string): Promise<string> {
  // A name of pure punctuation or non-Latin script slugifies to nothing;
  // the row still needs a slug, and the suffix loop makes it distinct.
  const base = slugify(name) || "business";

  // `base` is `[a-z0-9-]+` by construction, so it carries no LIKE wildcard
  // of its own to escape.
  const rows = await db
    .select({ slug: businesses.slug })
    .from(businesses)
    .where(ilike(businesses.slug, `${base}%`));

  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;

  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }

  return `${base}-${Date.now().toString(36)}`;
}
