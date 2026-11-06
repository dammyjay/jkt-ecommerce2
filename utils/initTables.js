const pool = require("../utils/db");

async function initTables() {
  try {
    await pool.query(`
      -- USERS TABLE
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        fullname VARCHAR(100),
        email VARCHAR(150) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        otp VARCHAR(10),
        is_verified BOOLEAN DEFAULT false,
        role VARCHAR(20) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- USERS2 TABLE
      CREATE TABLE IF NOT EXISTS users2 (
        id SERIAL PRIMARY KEY,
        fullname VARCHAR(100),
        email VARCHAR(150) UNIQUE NOT NULL,
        password VARCHAR(255),
        otp VARCHAR(10),
        is_verified BOOLEAN DEFAULT false,
        role VARCHAR(20) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        profile_image TEXT,
        phone VARCHAR(20),
        address TEXT,
        city VARCHAR(100),
        state VARCHAR(100)
      );

      -- CATEGORIES TABLE
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL
      );

      -- PRODUCTS TABLE
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(150),
        description TEXT,
        price NUMERIC(10,2),
        image_url TEXT,
        category_id INT REFERENCES categories(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- ORDERS TABLE
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users2(id) ON DELETE CASCADE,
        total_amount NUMERIC(10,2),
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS address TEXT,
      ADD COLUMN IF NOT EXISTS created_by_admin BOOLEAN DEFAULT false;

      -- Add customer_phone, customer_name, make user_id drop empty column
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(20),
      ADD COLUMN IF NOT EXISTS customer_name VARCHAR(20),
      ALTER COLUMN user_id DROP NOT NULL;

      ALTER TABLE orders
      ALTER COLUMN customer_name TYPE VARCHAR(100);

      ALTER TABLE orders
      ALTER COLUMN customer_phone TYPE VARCHAR(30);

      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS order_number VARCHAR(30) UNIQUE;

      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT false;

      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS issued_by INT REFERENCES users2(id);

      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INT REFERENCES orders(id) ON DELETE CASCADE,
        product_id INT REFERENCES products(id),
        quantity INT NOT NULL,
        price NUMERIC(10,2)
      );

      CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY,
        order_id INT REFERENCES orders(id) ON DELETE CASCADE,
        invoice_number VARCHAR(50),
        invoice_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- SESSION TABLE (for connect-pg-simple)
      CREATE TABLE IF NOT EXISTS session (
        "sid" varchar PRIMARY KEY COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL
      );

      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

      -- NEWSLETTER SUBSCRIPTIONS
      CREATE TABLE IF NOT EXISTS newsletter (
        id SERIAL PRIMARY KEY,
        email VARCHAR(150) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- PROMOTIONS
      CREATE TABLE IF NOT EXISTS promotions (
        id SERIAL PRIMARY KEY,
        title VARCHAR(150) NOT NULL,
        image_url TEXT,
        discount VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      

      -- TESTIMONIALS
      CREATE TABLE IF NOT EXISTS testimonials (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE testimonials
      ADD COLUMN IF NOT EXISTS rating INT CHECK (rating BETWEEN 1 AND 5),
      ADD COLUMN IF NOT EXISTS image_url TEXT,
      ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT false;


      -- CATEGORIES (updated with image)
      ALTER TABLE categories ADD COLUMN IF NOT EXISTS image_url TEXT;

      -- =========================
      -- PROJECTS
      -- =========================
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        short_description TEXT,
        full_description TEXT,
        category VARCHAR(100),
        complexity_level VARCHAR(50), -- Beginner, Intermediate, Advanced
        estimated_price NUMERIC(12,2),
        price_type VARCHAR(50) DEFAULT 'quote', -- fixed / quote
        thumbnail_image TEXT,
        is_featured BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- =========================
      -- PROJECT IMAGES
      -- =========================
      CREATE TABLE IF NOT EXISTS project_images (
        id SERIAL PRIMARY KEY,
        project_id INT REFERENCES projects(id) ON DELETE CASCADE,
        image_url TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- =========================
      -- PROJECT VIDEOS
      -- =========================
      CREATE TABLE IF NOT EXISTS project_videos (
        id SERIAL PRIMARY KEY,
        project_id INT REFERENCES projects(id) ON DELETE CASCADE,
        video_type VARCHAR(50), -- youtube / cloudinary
        video_url TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- =========================
      -- PROJECT DOCUMENTS
      -- =========================
      CREATE TABLE IF NOT EXISTS project_documents (
        id SERIAL PRIMARY KEY,
        project_id INT REFERENCES projects(id) ON DELETE CASCADE,
        document_type VARCHAR(50), -- proposal / agreement / requirements
        file_url TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- =========================
      -- PROJECT BOOKINGS
      -- =========================
      CREATE TABLE IF NOT EXISTS project_bookings (
        id SERIAL PRIMARY KEY,
        project_id INT REFERENCES projects(id) ON DELETE CASCADE,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        description TEXT,
        expected_budget NUMERIC(12,2),
        timeline VARCHAR(100),
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE project_bookings
        ALTER COLUMN project_id DROP NOT NULL;

      ALTER TABLE project_bookings
        ADD COLUMN IF NOT EXISTS custom_title VARCHAR(200);


      -- =========================
      -- PROJECT QUOTATIONS
      -- =========================
      CREATE TABLE IF NOT EXISTS project_quotations (
        id SERIAL PRIMARY KEY,
        booking_id INT REFERENCES project_bookings(id) ON DELETE CASCADE,
        quoted_amount NUMERIC(12,2),
        delivery_timeline VARCHAR(100),
        quotation_file TEXT,
        status VARCHAR(50) DEFAULT 'sent',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE project_quotations
      ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE;

      ALTER TABLE project_quotations
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;


      ALTER TABLE project_quotations
      ADD COLUMN IF NOT EXISTS quotation_html TEXT;

      -- =========================
      -- PROJECT AGREEMENTS
      -- =========================
      CREATE TABLE IF NOT EXISTS project_agreements (
        id SERIAL PRIMARY KEY,
        booking_id INT REFERENCES project_bookings(id) ON DELETE CASCADE,
        agreement_file TEXT NOT NULL,
        is_signed BOOLEAN DEFAULT false,
        signed_at TIMESTAMP
      );

      -- =========================
      -- PAYMENT MILESTONES
      -- =========================
      CREATE TABLE IF NOT EXISTS project_milestones (
        id SERIAL PRIMARY KEY,
        booking_id INT REFERENCES project_bookings(id) ON DELETE CASCADE,
        title VARCHAR(150),
        amount NUMERIC(12,2),
        is_paid BOOLEAN DEFAULT false,
        payment_reference TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE project_bookings
      DROP CONSTRAINT project_bookings_user_id_fkey;

      ALTER TABLE project_bookings
      ADD CONSTRAINT project_bookings_user_id_fkey
      FOREIGN KEY (user_id)
      REFERENCES users2(id)
      ON DELETE CASCADE;


    `);

    console.log("✅ All tables initialized successfully");
  } catch (err) {
    console.error("❌ Error initializing tables:", err);
  }

  // Promotions & discounts (kept separate so a failure above doesn't skip it)
  try {
    await pool.query(`
      ALTER TABLE products
        ADD COLUMN IF NOT EXISTS sale_price NUMERIC(10,2),
        ADD COLUMN IF NOT EXISTS sale_starts_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS sale_ends_at TIMESTAMPTZ;

      CREATE TABLE IF NOT EXISTS coupons (
        id SERIAL PRIMARY KEY,
        code VARCHAR(40) UNIQUE NOT NULL,
        description TEXT,
        discount_type VARCHAR(10) NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
        value NUMERIC(10,2) NOT NULL CHECK (value > 0),
        min_order NUMERIC(10,2) DEFAULT 0,
        max_discount NUMERIC(10,2),
        usage_limit INT,
        per_user_limit INT,
        used_count INT DEFAULT 0,
        starts_at TIMESTAMPTZ,
        ends_at TIMESTAMPTZ,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS coupon_redemptions (
        id SERIAL PRIMARY KEY,
        coupon_id INT REFERENCES coupons(id) ON DELETE CASCADE,
        order_id INT REFERENCES orders(id) ON DELETE SET NULL,
        user_id INT REFERENCES users2(id) ON DELETE SET NULL,
        email VARCHAR(150),
        discount_amount NUMERIC(10,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS subtotal_amount NUMERIC(10,2),
        ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(40),
        ADD COLUMN IF NOT EXISTS customer_email VARCHAR(150),
        ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30);

      -- Can a coupon be used on items already discounted by a sale/campaign?
      ALTER TABLE coupons
        ADD COLUMN IF NOT EXISTS allow_with_sale BOOLEAN DEFAULT true;

      -- Online payments (Paystack). NULL = older orders created before payments existed.
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20),
        ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(100),
        ADD COLUMN IF NOT EXISTS payment_channel VARCHAR(30),
        ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ,
        -- Fulfilment tracking shown to customers
        ADD COLUMN IF NOT EXISTS status_note TEXT,
        ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
        -- Delivery
        ADD COLUMN IF NOT EXISTS delivery_method VARCHAR(20),
        ADD COLUMN IF NOT EXISTS delivery_zone VARCHAR(100),
        ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10,2) DEFAULT 0;

      -- Delivery zones: a zone covers a set of states. The default zone covers every
      -- state not listed in another zone.
      CREATE TABLE IF NOT EXISTS delivery_zones (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        states TEXT[] DEFAULT '{}',
        fee NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (fee >= 0),
        free_over NUMERIC(10,2),
        eta VARCHAR(60),
        is_default BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      -- Starter zones on first run (edit them in Admin → Store → Delivery)
      INSERT INTO delivery_zones (name, states, fee, eta, is_default)
      SELECT * FROM (VALUES
        ('Lagos', ARRAY['Lagos'], 2500::numeric, '1–2 business days', false),
        ('Rest of Nigeria', '{}'::text[], 5000::numeric, '3–5 business days', true)
      ) AS seed(name, states, fee, eta, is_default)
      WHERE NOT EXISTS (SELECT 1 FROM delivery_zones);

      -- Project parts list: the components needed to build a project
      CREATE TABLE IF NOT EXISTS project_parts (
        id SERIAL PRIMARY KEY,
        project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
        note VARCHAR(120),
        sort_order INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (project_id, product_id)
      );
      CREATE INDEX IF NOT EXISTS project_parts_product_idx ON project_parts (product_id);

      -- Coupons can now give free delivery
      ALTER TABLE coupons DROP CONSTRAINT IF EXISTS coupons_discount_type_check;
      ALTER TABLE coupons ADD CONSTRAINT coupons_discount_type_check
        CHECK (discount_type IN ('percent', 'fixed', 'free_shipping'));
      ALTER TABLE coupons DROP CONSTRAINT IF EXISTS coupons_value_check;
      ALTER TABLE coupons ADD CONSTRAINT coupons_value_check CHECK (value >= 0);
      CREATE UNIQUE INDEX IF NOT EXISTS orders_payment_reference_key
        ON orders (payment_reference) WHERE payment_reference IS NOT NULL;

      -- Orders belong to accounts in users2 (the table login uses). Older databases
      -- still pointed this at the legacy "users" table, which rejected real customers.
      -- NOT VALID: don't re-check historic rows, only new/updated ones.
      -- SET NULL: deleting an account keeps its order history.
      ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_user_id_fkey;
      ALTER TABLE orders
        ADD CONSTRAINT orders_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users2(id) ON DELETE SET NULL NOT VALID;

      -- Automatic promo campaigns (no code needed)
      CREATE TABLE IF NOT EXISTS promo_campaigns (
        id SERIAL PRIMARY KEY,
        title VARCHAR(150) NOT NULL,
        description TEXT,
        banner_url TEXT,
        discount_type VARCHAR(10) NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
        value NUMERIC(10,2) NOT NULL CHECK (value > 0),
        applies_to VARCHAR(12) NOT NULL DEFAULT 'all' CHECK (applies_to IN ('all', 'categories', 'products')),
        category_ids INT[] DEFAULT '{}',
        product_ids INT[] DEFAULT '{}',
        starts_at TIMESTAMPTZ,
        ends_at TIMESTAMPTZ,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log("✅ Promotion tables ready");
  } catch (err) {
    console.error("❌ Error initializing promotion tables:", err);
  }
}

module.exports = initTables;
