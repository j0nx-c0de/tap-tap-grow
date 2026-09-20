-- Claimable/reassignable generic NFC tags, plus direct-to-activity tags.
-- Additive: tags.business_id becomes nullable (a tag can be pre-printed as
-- inventory with no business bound yet), and three new nullable columns let
-- a tag be claimed later and optionally point straight at one activity
-- instead of the full hub. Safe to run against a database that already has
-- claimed tags in it.
--
-- Note: activation_code is NOT backfilled here (no unambiguous-alphabet
-- generator available in raw SQL). A tag created before this migration has
-- no code and can't be re-claimed through the admin UI until one is
-- hand-issued via `db:studio` — new tags (db/seed.ts, createBusiness,
-- addTag, generateUnclaimedTags) all generate one going forward.

ALTER TABLE tags ALTER COLUMN business_id DROP NOT NULL;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS activation_code text UNIQUE;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS direct_activity text;

-- Every pre-existing tag already has a business — mark it claimed as of
-- when it was created, so it doesn't show up as unclaimed inventory.
UPDATE tags SET claimed_at = created_at WHERE business_id IS NOT NULL AND claimed_at IS NULL;
