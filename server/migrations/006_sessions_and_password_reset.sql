-- 006 – Sessions that can be ended + owner "Forgot password?" (16 Nov 2026)
--  * users.token_version: every login token carries it. Changing / resetting a password raises it, so every
--    older token stops working at once (before this, a token stayed valid for 7 days whatever happened).
--    Existing tokens have no version (= 0) and keep working until the next password change.
--  * revoked_tokens: "Log out" ends only that device's token (its random id), until the token would expire anyway.
--  * password_resets: one-time links emailed to the owner. Only a SHA-256 of the link's key is stored, never the key.

ALTER TABLE users ADD COLUMN token_version INT NOT NULL DEFAULT 0;

CREATE TABLE revoked_tokens (
  jti        VARCHAR(40)  PRIMARY KEY,
  user_id    INT          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ  NOT NULL
);
CREATE INDEX idx_revoked_tokens_expires ON revoked_tokens (expires_at);

CREATE TABLE password_resets (
  id         SERIAL       PRIMARY KEY,
  user_id    INT          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64)     NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ  NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_password_resets_user ON password_resets (user_id, created_at DESC);
