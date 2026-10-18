-- Prasad Shoes – handy queries. Open in pgAdmin (Query Tool) or DBeaver and run one at a time.
-- All times are India time.

-- 1. Today's orders not yet printed
SELECT id, ship_name, pincode, mobile1, payment_type, amount, product_name, note
FROM orders
WHERE deleted_at IS NULL AND NOT is_printed AND created_at >= current_date
ORDER BY created_at;

-- 2. Orders and COD total per day
SELECT created_at::date AS day, count(*) AS orders,
       sum(amount) FILTER (WHERE payment_type = 'COD') AS cod_total
FROM orders WHERE deleted_at IS NULL
GROUP BY 1 ORDER BY 1 DESC;

-- 3. Orders saved by each staff member this month
SELECT u.name, count(o.id) AS orders
FROM users u
LEFT JOIN orders o ON o.created_by = u.id AND o.deleted_at IS NULL AND o.created_at >= date_trunc('month', now())
GROUP BY u.name ORDER BY 2 DESC;

-- 4. Find a customer by mobile or name
SELECT id, ship_name, address, pincode, mobile1, amount, is_printed, created_at
FROM orders
WHERE mobile1 = '8106093098' OR ship_name ILIKE '%sudharshan%'
ORDER BY created_at DESC;

-- 5. Permission matrix: every staff x every permission
SELECT u.name, u.is_active, p.code, (up.user_id IS NOT NULL) AS granted
FROM users u CROSS JOIN permissions p
LEFT JOIN user_permissions up ON up.user_id = u.id AND up.permission_code = p.code
WHERE u.role = 'STAFF'
ORDER BY u.name, p.sort_order;

-- 6. Duplicates that were saved with "Save anyway"
SELECT o.id, o.ship_name, o.mobile1, u.name AS saved_by, o.created_at
FROM orders o JOIN users u ON u.id = o.created_by
WHERE o.dup_override ORDER BY o.created_at DESC;

-- 7. Top states
SELECT state, count(*) FROM orders WHERE deleted_at IS NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 20;

-- 8. Who changed what (last 100 actions)
SELECT a.created_at, u.name AS by_user, a.action, a.entity, a.entity_id, a.new_data
FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
ORDER BY a.created_at DESC LIMIT 100;

-- 9. Label files downloaded
SELECT b.id, b.created_at, u.name, b.order_count, b.page_count
FROM label_batches b JOIN users u ON u.id = b.created_by
ORDER BY b.created_at DESC LIMIT 50;

-- 10. Turn a staff member off (same as the switch in the app)
-- UPDATE users SET is_active = FALSE, updated_at = now() WHERE mobile = '9xxxxxxxxx';
