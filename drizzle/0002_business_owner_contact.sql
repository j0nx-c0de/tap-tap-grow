-- Owner/manager contact info per business — who the operator calls when
-- something's wrong with an account. Additive and nullable, safe to run
-- against a database that already has businesses in it.

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS owner_name text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS owner_email text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS owner_phone text;
