-- The shop accepts any 10-digit phone number for customers (the 6–9 first-digit rule is removed).
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_mobile1_check;
ALTER TABLE orders ADD CONSTRAINT orders_mobile1_check CHECK (mobile1 ~ '^[0-9]{10}$');
