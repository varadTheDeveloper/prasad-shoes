-- 008 – More mobile numbers (client, 18 Nov 2026): a customer may give 3 or more numbers; every one prints on the label
-- as given. Mobile 1 + Mobile 2 stay as they are; the 3rd, 4th… go here as "9272741689, 9876543210". Existing orders unchanged.
ALTER TABLE orders ADD COLUMN mobile_more VARCHAR(120);
