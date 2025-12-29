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
const passport = require("./utils/passportSetup");
const favicon = require("serve-favicon");

// const session = require("express-session");
// Load environment variables
dotenv.config();

const app = express();

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

app.get("/", async (req, res) => {
  try {
    // Fetch categories
    const categoriesResult = await pool.query("SELECT * FROM categories ORDER BY name ASC");
    const categories = categoriesResult.rows;

    // Fetch featured products
    const featuredResult = await pool.query("SELECT * FROM products ORDER BY created_at DESC LIMIT 6");
    const featuredProducts = featuredResult.rows;

    // Fetch new arrivals
    const newResult = await pool.query("SELECT * FROM products ORDER BY created_at DESC LIMIT 6");
    const newProducts = newResult.rows;

    // Optional: fetch promotions & testimonials
     const promotions = [
      { title: "Flash Sale", discount: "20%", image_url: "/images/promo1.jpg" },
      { title: "Black Friday", discount: "50%", image_url: "/images/promo2.jpg" },
      { title: "Mega Deal", discount: "30%", image_url: "/images/promo3.jpg" },
    ];

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

// const userRoutes = require("./routes/userRoutes");
// app.use("/", userRoutes);



// 🧪 TEST ROUTE
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
