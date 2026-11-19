-- Track delivery worker ownership and lease expiry.
ALTER TABLE webhook_deliveries
    ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS locked_by VARCHAR(100);

-- Allow workers to reclaim expired leases efficiently.
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_lock_recovery
    ON webhook_deliveries (locked_at)
    WHERE locked_at IS NOT NULL;