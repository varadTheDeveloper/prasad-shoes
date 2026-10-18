-- Prasad Shoes – first migration (BRD v1.0, section 8)
-- Run by: npm run migrate  (records itself in schema_migrations, runs once)

-- 1. users ------------------------------------------------------------
CREATE TABLE users (
  id                   SERIAL PRIMARY KEY,
  name                 VARCHAR(100) NOT NULL,
  mobile               VARCHAR(10)  NOT NULL UNIQUE CHECK (mobile ~ '^[6-9][0-9]{9}$'),
  password_hash        TEXT         NOT NULL,                 -- bcrypt
  role                 VARCHAR(10)  NOT NULL DEFAULT 'STAFF' CHECK (role IN ('ADMIN','STAFF')),
  is_active            BOOLEAN      NOT NULL DEFAULT TRUE,     -- false = removed by owner
  must_change_password BOOLEAN      NOT NULL DEFAULT TRUE,
  failed_logins        SMALLINT     NOT NULL DEFAULT 0,
  locked_until         TIMESTAMPTZ,
  last_login_at        TIMESTAMPTZ,
  created_by           INT REFERENCES users(id),
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- 2. permissions (master list) ----------------------------------------
CREATE TABLE permissions (
  code        VARCHAR(40)  PRIMARY KEY,
  label       VARCHAR(100) NOT NULL,
  group_name  VARCHAR(20)  NOT NULL,    -- Orders | Printing | Special
  default_on  BOOLEAN      NOT NULL,
  sort_order  SMALLINT     NOT NULL
);
INSERT INTO permissions VALUES
  ('ORDER_CREATE',       'Save new orders',                  'Orders',   TRUE,  1),
  ('ORDER_VIEW_ALL',     'See everyone''s orders',           'Orders',   TRUE,  2),
  ('ORDER_VIEW_AMOUNT',  'See amounts',                      'Orders',   TRUE,  3),
  ('ORDER_EDIT_OWN',     'Edit own orders',                  'Orders',   TRUE,  4),
  ('ORDER_EDIT_ALL',     'Edit anyone''s orders',            'Orders',   FALSE, 5),
  ('ORDER_DELETE',       'Delete orders',                    'Orders',   FALSE, 6),
  ('LABEL_PRINT',        'Download labels',                  'Printing', TRUE,  7),
  ('LABEL_REPRINT',      'Reprint printed orders',           'Printing', FALSE, 8),
  ('DUPLICATE_OVERRIDE', 'Save anyway on duplicate warning', 'Special',  FALSE, 9);

-- 3. user_permissions -------------------------------------------------
-- ADMIN users need no rows here: the API treats ADMIN as having every permission.
CREATE TABLE user_permissions (
  user_id         INT         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_code VARCHAR(40) NOT NULL REFERENCES permissions(code),
  granted_by      INT         NOT NULL REFERENCES users(id),
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission_code)
);

-- 4. orders (one row = one parcel label) ------------------------------
CREATE TABLE orders (
  id                SERIAL PRIMARY KEY,                       -- shown as #1042
  ship_name         VARCHAR(120) NOT NULL,
  address           TEXT         NOT NULL,
  landmark          VARCHAR(200),
  district          VARCHAR(100),
  state             VARCHAR(60),
  pincode           CHAR(6)      NOT NULL CHECK (pincode ~ '^[1-9][0-9]{5}$'),
  mobile1           VARCHAR(10)  NOT NULL CHECK (mobile1 ~ '^[6-9][0-9]{9}$'),
  mobile2           VARCHAR(10),
  product_name      VARCHAR(150),                             -- optional
  size              VARCHAR(20),
  note              VARCHAR(250),                             -- optional, e.g. 'RED KURUNDWAD'
  payment_type      VARCHAR(10)  NOT NULL DEFAULT 'COD' CHECK (payment_type IN ('COD','PREPAID')),
  amount            NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  is_printed        BOOLEAN      NOT NULL DEFAULT FALSE,
  printed_at        TIMESTAMPTZ,
  printed_by        INT REFERENCES users(id),
  raw_message       TEXT         NOT NULL,                    -- exact WhatsApp text pasted
  msg_hash          CHAR(64)     NOT NULL,                    -- sha256 of normalised raw_message
  client_request_id UUID         NOT NULL UNIQUE,             -- one per filled form; stops double-submit
  dup_override      BOOLEAN      NOT NULL DEFAULT FALSE,      -- saved with "Save anyway"
  created_by        INT          NOT NULL REFERENCES users(id),
  updated_by        INT REFERENCES users(id),
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ,
  deleted_by        INT REFERENCES users(id),
  CONSTRAINT cod_needs_amount CHECK (payment_type = 'PREPAID' OR amount > 0)
);
CREATE INDEX idx_orders_created  ON orders (created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_orders_printed  ON orders (is_printed, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_orders_mobile   ON orders (mobile1, pincode, created_at DESC);
CREATE INDEX idx_orders_msg_hash ON orders (msg_hash, created_at DESC);
CREATE INDEX idx_orders_creator  ON orders (created_by, created_at DESC);

-- 5-6. label batches (each Word file downloaded) ----------------------
CREATE TABLE label_batches (
  id          SERIAL PRIMARY KEY,
  created_by  INT         NOT NULL REFERENCES users(id),
  order_count INT         NOT NULL,
  page_count  INT         NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE label_batch_orders (
  batch_id  INT NOT NULL REFERENCES label_batches(id) ON DELETE CASCADE,
  order_id  INT NOT NULL REFERENCES orders(id),
  position  INT NOT NULL,                                     -- 1-2 = page 1, 3-4 = page 2
  PRIMARY KEY (batch_id, order_id)
);

-- 7. shop_settings (single row: the "From" block) ---------------------
CREATE TABLE shop_settings (
  id         INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  shop_name  VARCHAR(100) NOT NULL,
  address1   VARCHAR(200) NOT NULL,
  address2   VARCHAR(200),
  city_pin   VARCHAR(100) NOT NULL,
  phones     VARCHAR(100) NOT NULL,
  updated_by INT REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO shop_settings (shop_name, address1, address2, city_pin, phones)
VALUES ('PRASAD SHOES', '1306, Shukrawar Peth', 'Nr. BSNL office', 'Pune 411002', '7020861805, 9270063067');

-- 8. audit_logs -------------------------------------------------------
CREATE TABLE audit_logs (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INT REFERENCES users(id),
  action     VARCHAR(30) NOT NULL,   -- ORDER_CREATE, ORDER_EDIT, ORDER_DELETE, ORDER_RESTORE, LABEL_PRINT,
                                     -- STAFF_ADD, STAFF_EDIT, STAFF_DEACTIVATE, STAFF_ACTIVATE, PASSWORD_RESET,
                                     -- PERMISSION_GRANT, PERMISSION_REVOKE, SHOP_EDIT
  entity     VARCHAR(30) NOT NULL,
  entity_id  INT,
  old_data   JSONB,
  new_data   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_entity ON audit_logs (entity, entity_id);
CREATE INDEX idx_audit_created ON audit_logs (created_at DESC);
