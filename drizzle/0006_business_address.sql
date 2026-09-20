-- Street address per business location. Separate parts rather than one text
-- blob so the admin list and search can display and match on city/state — the
-- disambiguator between one chain's several locations and a competitor with a
-- near-identical name. Additive and nullable, safe against a live database.
-- (No index: the admin search is a leading-wildcard ILIKE a btree can't serve,
-- against a list of businesses one operator can walk door to door.)

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS address_line1 text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS address_line2 text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS postal_code text;
