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
