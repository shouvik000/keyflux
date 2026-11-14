
CREATE TABLE IF NOT EXISTS api_alerts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    project_id BIGINT NOT NULL
        REFERENCES projects(id) ON DELETE CASCADE,

    api_key_id BIGINT
        REFERENCES api_keys(id) ON DELETE SET NULL,

    alert_type VARCHAR(50) NOT NULL
        CHECK (
            alert_type IN (
                'RATE_LIMIT_WARNING',
                'RATE_LIMIT_EXCEEDED'
            )
        ),

    usage_count BIGINT NOT NULL
        CHECK (usage_count >= 0),

    rate_limit BIGINT NOT NULL
        CHECK (rate_limit > 0),

    window_ms BIGINT NOT NULL
        CHECK (window_ms > 0),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_alerts_project_created
    ON api_alerts (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_alerts_api_key_created
    ON api_alerts (api_key_id, created_at DESC);
