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
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        total_amount NUMERIC(10,2),
        status VARCHAR(50) DEFAULT 'pending',
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
}

module.exports = initTables;
