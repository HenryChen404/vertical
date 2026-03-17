-- Users table: stores PLAUD OAuth users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plaud_user_id TEXT UNIQUE NOT NULL,
    name TEXT,
    avatar_url TEXT,
    plaud_access_token TEXT,
    plaud_refresh_token TEXT,
    plaud_token_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TRIGGER set_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- User integrations: per-user Composio connection status
CREATE TABLE IF NOT EXISTS user_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,  -- 'google', 'outlook', 'salesforce'
    composio_entity_id TEXT,
    connected BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(user_id, provider)
);

CREATE TRIGGER set_user_integrations_updated_at
    BEFORE UPDATE ON user_integrations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Add user_id to existing tables
ALTER TABLE events ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
ALTER TABLE event_sources ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
ALTER TABLE recordings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);

-- Indexes for user_id lookups
CREATE INDEX IF NOT EXISTS idx_events_user_id ON events(user_id);
CREATE INDEX IF NOT EXISTS idx_recordings_user_id ON recordings(user_id);
CREATE INDEX IF NOT EXISTS idx_workflows_user_id ON workflows(user_id);
CREATE INDEX IF NOT EXISTS idx_user_integrations_user_id ON user_integrations(user_id);
