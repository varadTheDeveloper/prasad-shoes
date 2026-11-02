-- 005 – COD orders (3 Nov 2026)
--  * COD is switched on: staff pick Prepaid or COD (orders.payment_type, already there).
--  * COD amount uses orders.amount (already there; COD still needs an amount > 0 – cod_needs_amount).
--  * New COD-only details: booking date and weight. Both optional, so every existing (Prepaid) order
--    stays exactly as it is. The size + description ("8 pona sanke awaj") use the existing size / note.
--    The fixed India Post details (Booking Under / Customer ID / Contract ID / BNPL HUB) are NOT stored:
--    they come from shared/cod.ts and print on every COD label. "From" is always the shop.

ALTER TABLE orders
  ADD COLUMN booking_date DATE,
  ADD COLUMN weight       VARCHAR(20);
