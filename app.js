// app.js
const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const bodyParser = require("body-parser");
const path = require("path");
const dotenv = require("dotenv");
const methodOverride = require("method-override");
const layout = require("express-ejs-layouts");
const pool = require("./utils/db");
const createTables = require("./utils/initTables");
const { withPricing, getActiveCampaigns } = require("./utils/pricing");
const campaignController = require("./controllers/campaignController");
const passport = require("./utils/passportSetup");
const favicon = require("serve-favicon");

// const session = require("express-session");
// Load environment variables
dotenv.config();

const app = express();

// 💳 Paystack webhook — must come before express.json() so the signature
// can be checked against the exact raw body Paystack sent.
app.post(
  "/payment/paystack/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
  require("./controllers/cartController").paystackWebhook
);

// 🧩 Middleware
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "public")));
app.use(favicon(path.join(__dirname, "public", "images", "JKT logo bg.png")));

app.use(layout);

// 🖼️ EJS View Engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.set("view cache", false);

// 🗄️ Session Configuration
app.use(
  session({
    store: new pgSession({
      pool: pool,
      tableName: "session",
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false, // change to true in production (HTTPS)
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

// Make session user globally available in EJS
// app.use((req, res, next) => {
//   if (req.session && req.session.user) {
//     req.user = req.session.user;
//     res.locals.user = req.session.user;
//   }
//   next();
// });

app.use((req, res, next) => {
  // If user exists via passport or session, make it available to EJS
  if (req.user) {
    res.locals.user = req.user;
  } else if (req.session && req.session.user) {
    res.locals.user = req.session.user;
  } else {
    res.locals.user = null;
  }
  next();
});


// Default page title
app.use((req, res, next) => {
  res.locals.title = "JKT E-Commerce";
  res.locals.currentUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  res.locals.ogImage = "/images/JKT logo bg.png";
  res.locals.description = "Shop quality products at JKT E-Commerce";
  res.locals.keywords = "ecommerce, shop, jkt";
  res.locals.cartQty = req.session.cart?.totalQty || 0;
  next();
});

// 🛒 ROUTES
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const productRoutes = require("./routes/productRoutes");
const orderRoutes = require("./routes/orderRoutes");
const cartRoutes = require("./routes/cartRoutes");
const userRoutes = require("./routes/userRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const adminProjectRoutes = require("./routes/adminProjectRoutes");
const projectRoutes = require("./routes/projectRoutes");



// USER ROUTES
app.use("/auth", authRoutes);
app.use("/products", productRoutes);  // user-facing product routes
app.use("/orders", orderRoutes);      // user-facing orders
app.use("/cart", cartRoutes);
app.use("/projects", projectRoutes);

// ADMIN ROUTES
app.use("/admin", adminRoutes);
app.use("/users", userRoutes);
app.use("/", categoryRoutes);
app.use("/admin", adminProjectRoutes);





// 🏠 HOME ROUTE
// app.get("/", (req, res) => {
//   res.render("public/home", { title: "Home | JKT E-Commerce", 
//     description: "Shop quality products at affordable prices on JKT E-Commerce", 
//     keywords: "online shopping, jkt, ecommerce",
//     ogImage: "/images/JKT logo bg.png",});
// });

// Hot Deals: running campaigns + every discounted product
app.get("/promotions", campaignController.hotDeals);

app.get("/", async (req, res) => {
  try {
    // Fetch categories
    const categoriesResult = await pool.query("SELECT * FROM categories ORDER BY name ASC");
    const categories = categoriesResult.rows;

    // Fetch featured products
    const featuredResult = await pool.query("SELECT * FROM products ORDER BY created_at DESC LIMIT 6");
    const featuredProducts = await withPricing(featuredResult.rows);

    // Fetch new arrivals
    const newResult = await pool.query("SELECT * FROM products ORDER BY created_at DESC LIMIT 6");
    const newProducts = await withPricing(newResult.rows);

    // Running promo campaigns (managed in Admin → Store → Promotions)
    const promotions = (await getActiveCampaigns()).map(c => ({
      id: c.id,
      title: c.title,
      description: c.description,
      discount: campaignController.discountLabel(c),
      image_url: c.banner_url,
      ends_at: c.ends_at,
    }));

    // Dummy testimonials (replace with actual testimonials table if exists)
    // const testimonials = [
    //   { name: "John Doe", message: "Amazing service and products!" },
    //   { name: "Jane Smith", message: "Fast delivery, high quality!" },
    //   { name: "Aliyah K.", message: "I love shopping on JKT E-Commerce!" },
    // ];

    const testimonialsResult = await pool.query(
      "SELECT * FROM testimonials WHERE is_approved = true ORDER BY created_at DESC LIMIT 6"
    );
    const testimonials = testimonialsResult.rows;


    res.render("public/home", {
      title: "Home | JKT E-Commerce",
      description: "Shop quality products at affordable prices on JKT E-Commerce",
      keywords: "online shopping, jkt, ecommerce",
      ogImage: "/images/JKT logo bg.png",
      categories,
      featuredProducts,
      newProducts,
      promotions,
      testimonials
    });
  } catch (err) {
    console.error("Error loading home page:", err);
    res.status(500).send("Error loading homepage");
  }
});

// This one the project and product search combined with both prices
// app.get("/api/search", async (req, res) => {
//   const { q } = req.query;

//   if (!q || q.trim() === "") {
//     return res.json([]);
//   }

//   try {
//     const products = await pool.query(
//       `
//       SELECT 
//         id,
//         name AS title,
//         'product' AS type,
//         price,
//         image_url AS image
//       FROM products
//       WHERE name ILIKE $1
//       LIMIT 5
//       `,
//       [`%${q}%`]
//     );

//     const projects = await pool.query(
//       `
//       SELECT 
//         id,
//         title,
//         'project' AS type,
//         estimated_price AS price,
//         thumbnail_image AS image,
//         price_type
//       FROM projects
//       WHERE title ILIKE $1
//         AND is_active = true
//       LIMIT 5
//       `,
//       [`%${q}%`]
//     );

//     res.json([...products.rows, ...projects.rows]);
//   } catch (err) {
//     console.error("Search error:", err);
//     res.status(500).json([]);
//   }
// });

// while this one is only for price products  project request a quote
app.get("/api/search", async (req, res) => {
  const { q } = req.query;

  if (!q || q.trim() === "") {
    return res.json([]);
  }

  try {
    const products = await pool.query(
      `
      SELECT 
        id,
        name AS title,
        'product' AS type,
        price, category_id, sale_price, sale_starts_at, sale_ends_at,
        image_url AS image
      FROM products
      WHERE name ILIKE $1
      `,
      [`%${q}%`]
    );

    const projects = await pool.query(
      `
      SELECT 
        id,
        title,
        'project' AS type,
        thumbnail_image AS image
      FROM projects
      WHERE title ILIKE $1
        AND is_active = true
      `,
      [`%${q}%`]
    );

    // Return the live price (sale / campaign) without leaking pricing internals
    const priced = (await withPricing(products.rows)).map(p => ({
      id: p.id,
      title: p.title,
      type: p.type,
      image: p.image,
      price: p.pricing.price,
    }));

    res.json([...priced, ...projects.rows]);
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json([]);
  }
});


app.get("/test", (req, res) => {
  res.send("✅ JKT E-Commerce Server Running Successfully");
});

// 🛠️ Run table creation on startup
createTables();

// 🚀 Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
