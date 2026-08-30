-- Verifiable redemption + DNA punch tags.
--
-- Run against DATABASE_URL. Additive only: no column or table is dropped, so
-- this is safe to apply to a database that already has demo data in it.
--
-- `ALTER TYPE ... ADD VALUE` cannot be used in the same transaction that adds
-- it, so these run as separate statements rather than one wrapped block.

ALTER TYPE redemption_status ADD VALUE IF NOT EXISTS 'redeemed';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'redemption_redeemed';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'punch_tap';

ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS redeemed_at timestamptz;

CREATE TABLE IF NOT EXISTS punch_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  key text NOT NULL UNIQUE,
  label text,
  sdm_meta_key text NOT NULL,
  sdm_file_key text NOT NULL,
  uid text,
  last_counter integer NOT NULL DEFAULT 0,
  tap_count integer NOT NULL DEFAULT 0,
  last_tapped_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS punch_tags_business_id_idx ON punch_tags (business_id);

ALTER TABLE punch_tags ADD COLUMN IF NOT EXISTS last_awarded_counter integer NOT NULL DEFAULT 0;
