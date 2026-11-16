
CREATE TABLE IF NOT EXISTS webhooks (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    project_id BIGINT NOT NULL
        REFERENCES projects(id) ON DELETE CASCADE,

    name VARCHAR(100) NOT NULL,

    url TEXT NOT NULL
        CHECK (url ~ '^https://'),

   secret_encrypted TEXT NOT NULL,

    events TEXT[] NOT NULL
        CHECK (
            cardinality(events) > 0
            AND events <@ ARRAY[
                'RATE_LIMIT_WARNING',
                'RATE_LIMIT_EXCEEDED'
            ]::TEXT[]
        ),

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_project_active
    ON webhooks (project_id, is_active);


CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    webhook_id BIGINT NOT NULL
        REFERENCES webhooks(id) ON DELETE CASCADE,

    alert_id BIGINT NOT NULL
        REFERENCES api_alerts(id) ON DELETE CASCADE,

    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (
            status IN (
                'PENDING',
                'SUCCESS',
                'FAILED'
            )
        ),

    attempts INTEGER NOT NULL DEFAULT 0
        CHECK (attempts >= 0),

    response_status INTEGER,

    response_body TEXT,

    next_retry_at TIMESTAMPTZ,

    delivered_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (webhook_id, alert_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending
    ON webhook_deliveries (next_retry_at, created_at)
    WHERE status IN ('PENDING', 'FAILED');

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook
    ON webhook_deliveries (webhook_id, created_at DESC);
