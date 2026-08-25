import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { businesses, contacts, redemptions } from "@/db/schema";
import { isStaffAuthed } from "@/lib/auth";
import { RedemptionConsole } from "./console";
import { PinForm } from "./pin-form";

export default async function StaffPage({ params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  const db = getDb();
  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.slug, businessSlug))
    .limit(1);
  if (!business) notFound();

  const authed = await isStaffAuthed(businessSlug);
  if (!authed) return <PinForm businessSlug={businessSlug} businessName={business.name} />;

  const rows = await db
    .select({ redemption: redemptions, contact: contacts })
    .from(redemptions)
    .leftJoin(contacts, eq(redemptions.contactId, contacts.id))
    .where(eq(redemptions.businessId, business.id))
    .orderBy(desc(redemptions.createdAt))
    .limit(50);

  return <RedemptionConsole businessSlug={business.slug} businessName={business.name} rows={rows} />;
}
