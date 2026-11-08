ALTER TABLE api_keys
ADD COLUMN rate_limit_max INTEGER NOT NULL DEFAULT 100
    CHECK (rate_limit_max > 0),
ADD COLUMN rate_limit_window_ms INTEGER NOT NULL DEFAULT 60000
    CHECK (rate_limit_window_ms > 0);
