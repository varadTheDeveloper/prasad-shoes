-- 007 – Several pairs in one order (client, 17 Nov 2026): 2 or 10 pairs to one address go in ONE box, one label.
-- Size holds every size ("7, 8, 8, 9, 10, …") and Note every size line as written, so both need more room.
-- Only longer limits: no existing order changes.
ALTER TABLE orders ALTER COLUMN size TYPE VARCHAR(100);
ALTER TABLE orders ALTER COLUMN note TYPE VARCHAR(500);
