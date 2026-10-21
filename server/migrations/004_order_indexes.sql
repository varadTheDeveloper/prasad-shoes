-- Faster order list, date filter and search with many orders.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS orders_created_idx ON orders (created_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS orders_pincode_idx ON orders (pincode);
CREATE INDEX IF NOT EXISTS orders_mobile1_trgm ON orders USING gin (mobile1 gin_trgm_ops);
CREATE INDEX IF NOT EXISTS orders_name_trgm ON orders USING gin (ship_name gin_trgm_ops);
