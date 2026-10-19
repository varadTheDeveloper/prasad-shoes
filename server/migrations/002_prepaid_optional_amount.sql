-- 002 – changes requested on 19 Oct 2026
--  * Amount is optional: blank stays blank (NULL) instead of 0.
--  * COD is switched off for now: new orders default to PREPAID (COD can come back later).
--  * Everyone sees one combined order list, so the "See everyone's orders" permission is removed.

ALTER TABLE orders ALTER COLUMN amount DROP NOT NULL;
ALTER TABLE orders ALTER COLUMN amount DROP DEFAULT;
ALTER TABLE orders ALTER COLUMN payment_type SET DEFAULT 'PREPAID';

-- COD still needs an amount (for when COD is switched back on); PREPAID never does.
ALTER TABLE orders DROP CONSTRAINT cod_needs_amount;
ALTER TABLE orders ADD CONSTRAINT cod_needs_amount CHECK (payment_type = 'PREPAID' OR COALESCE(amount, 0) > 0);

DELETE FROM user_permissions WHERE permission_code = 'ORDER_VIEW_ALL';
DELETE FROM permissions WHERE code = 'ORDER_VIEW_ALL';
