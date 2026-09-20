import { desc, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { tags } from "@/db/schema";

type Db = ReturnType<typeof getDb>;

export type UnclaimedTagRow = {
  id: string;
  activationCode: string | null;
  createdAt: Date;
  tapCount: number;
};

// Batch-printed inventory sitting in a box, not yet bound to a business.
export async function loadUnclaimedTags(db: Db): Promise<UnclaimedTagRow[]> {
  return db
    .select({ id: tags.id, activationCode: tags.activationCode, createdAt: tags.createdAt, tapCount: tags.tapCount })
    .from(tags)
    .where(isNull(tags.businessId))
    .orderBy(desc(tags.createdAt));
}
