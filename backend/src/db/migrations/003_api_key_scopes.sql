ALTER TABLE api_keys
ADD COLUMN scopes TEXT[] NOT NULL DEFAULT ARRAY['*']::TEXT[];

ALTER TABLE api_keys
ADD CONSTRAINT api_keys_scopes_not_empty
CHECK (cardinality(scopes) > 0);
