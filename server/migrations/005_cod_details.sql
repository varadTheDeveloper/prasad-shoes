-- 005 – COD orders (3 Nov 2026)
--  * COD is switched on: staff pick Prepaid or COD (orders.payment_type, already there).
--  * COD amount uses orders.amount (already there; COD still needs an amount > 0 – cod_needs_amount).
--  * New COD-only details. All optional, so every existing (Prepaid) order stays exactly as it is.
--    The fixed India Post details (Booking Under / Customer ID / Contract ID) are NOT stored:
--    they come from shared/cod.ts and print on every COD label.

ALTER TABLE orders
  ADD COLUMN booking_date   DATE,
  ADD COLUMN weight         VARCHAR(20),
  ADD COLUMN sender_name    VARCHAR(120),
  ADD COLUMN sender_address TEXT,
  ADD COLUMN sender_mobile  VARCHAR(10) CHECK (sender_mobile ~ '^[0-9]{10}$');
