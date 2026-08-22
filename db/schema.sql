CREATE TABLE IF NOT EXISTS sms_messages (
  id          BIGSERIAL PRIMARY KEY,
  recipient   TEXT        NOT NULL,
  guest_name  TEXT,
  message     TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'queued',
  provider    TEXT,
  template    TEXT,
  segments    INTEGER     NOT NULL DEFAULT 1,
  cost        NUMERIC(10,4) NOT NULL DEFAULT 0,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS sms_messages_created_at_idx ON sms_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS sms_messages_status_idx     ON sms_messages (status);
CREATE INDEX IF NOT EXISTS sms_messages_recipient_idx  ON sms_messages (recipient);

-- Source IP of the gateway that called SMSInsert (added with the new list design).
ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS source_ip TEXT;


-- ---------------------------------------------------------------------------
-- Guest-facing login + push notifications
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app_users (
  id            BIGSERIAL PRIMARY KEY,
  mobile        TEXT        NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id         BIGSERIAL PRIMARY KEY,
  mobile     TEXT        NOT NULL,
  code       TEXT        NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS otp_codes_mobile_idx ON otp_codes (mobile, created_at DESC);

CREATE TABLE IF NOT EXISTS device_tokens (
  id           BIGSERIAL PRIMARY KEY,
  mobile       TEXT        NOT NULL,
  token        TEXT        NOT NULL UNIQUE,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS device_tokens_mobile_idx ON device_tokens (mobile);

CREATE TABLE IF NOT EXISTS notification_log (
  id         BIGSERIAL PRIMARY KEY,
  sms_id     BIGINT,
  mobile     TEXT,
  token      TEXT,
  ok         BOOLEAN     NOT NULL DEFAULT FALSE,
  error      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notification_log_created_idx ON notification_log (created_at DESC);
