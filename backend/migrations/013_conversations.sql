-- Persistent clinical conversations so patients can resume where they left off.
CREATE TABLE IF NOT EXISTS conversations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     TEXT        NOT NULL DEFAULT 'default',
  owner_user_id TEXT,                          -- null = guest session (ephemeral client id)
  guest_key     TEXT,                          -- client-generated key for unsigned sessions
  title         TEXT        NOT NULL DEFAULT 'New consultation',
  status        TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'closed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_owner_updated
  ON conversations (tenant_id, owner_user_id, updated_at DESC)
  WHERE owner_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_guest_updated
  ON conversations (tenant_id, guest_key, updated_at DESC)
  WHERE guest_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS conversation_messages (
  id               BIGSERIAL PRIMARY KEY,
  conversation_id  UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role             TEXT        NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content          TEXT        NOT NULL,
  metadata         JSONB       DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_conv_time
  ON conversation_messages (conversation_id, created_at ASC);

-- Ensure gen_random_uuid is available (pgcrypto).
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgcrypto unavailable; ensure UUID generation is configured.';
END $$;
