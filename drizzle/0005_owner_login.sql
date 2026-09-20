-- Passwordless business-owner login. One row per sign-in request: an emailed
-- magic-link token or a texted 6-digit code, stored only as an HMAC, dead on
-- first use / expiry / too many wrong guesses.

CREATE TABLE IF NOT EXISTS owner_login_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  channel text NOT NULL,
  secret_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Serves the send throttle, which counts a business's recent requests.
CREATE INDEX IF NOT EXISTS owner_login_tokens_business_created_idx
  ON owner_login_tokens (business_id, created_at);
