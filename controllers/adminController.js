const pool = require("../utils/db");
const cloudinary = require("../utils/cloudinary");
const multer = require("multer");
const upload = multer({ dest: "tmp/" }); // temp storage

exports.getDashboard = async (req, res) => {
  try {
    // Total Products
    const totalProductsRes = await pool.query("SELECT COUNT(*) FROM products");
    const totalProducts = totalProductsRes.rows[0].count;

    // Total Orders
    const totalOrdersRes = await pool.query("SELECT COUNT(*) FROM orders");
    const totalOrders = totalOrdersRes.rows[0].count;

    // Total Users
    const totalUsersRes = await pool.query("SELECT COUNT(*) FROM users2");
    const totalUsers = totalUsersRes.rows[0].count;

    // Total Sales (completed orders)
    const totalSalesRes = await pool.query(
      "SELECT COALESCE(SUM(total_amount), 0) AS total_sales FROM orders WHERE status='completed'"
    );
    const totalSales = totalSalesRes.rows[0].total_sales || 0;

    // Pending Orders
    const pendingOrdersRes = await pool.query(
      "SELECT COUNT(*) FROM orders WHERE status='pending'"
    );
    const pendingOrders = pendingOrdersRes.rows[0].count;

    // Low Stock Products (assuming threshold = 5)
    const lowStockRes = await pool.query(
      "SELECT COUNT(*) FROM products WHERE price <= 5"
    );
    const lowStock = lowStockRes.rows[0].count;

    // New Users (last 7 days)
    const newUsersRes = await pool.query(
      "SELECT COUNT(*) FROM users2 WHERE created_at >= NOW() - INTERVAL '7 days'"
    );
    const newUsers = newUsersRes.rows[0].count;

    // New Orders (last 7 days)
    const newOrdersRes = await pool.query(
      "SELECT COUNT(*) FROM orders WHERE created_at >= NOW() - INTERVAL '7 days'"
    );
    const newOrders = newOrdersRes.rows[0].count;

    // Sales by Date (last 30 days) for line chart
    const salesByDateRes = await pool.query(`
      SELECT to_char(created_at::date, 'YYYY-MM-DD') AS date,
             COALESCE(SUM(total_amount),0) AS total
      FROM orders
      WHERE status='completed' AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY date
      ORDER BY date
    `);
    const salesByDate = {
      labels: salesByDateRes.rows.map(r => r.date),
      data: salesByDateRes.rows.map(r => r.total)
    };

    // Orders by Status for doughnut chart
    const ordersStatusRes = await pool.query(`
      SELECT status, COUNT(*) AS count
      FROM orders
      GROUP BY status
    `);
    const ordersByStatus = {
      pending: 0,
      completed: 0,
      cancelled: 0
    };
    ordersStatusRes.rows.forEach(r => {
      if (r.status === "pending") ordersByStatus.pending = parseInt(r.count);
      if (r.status === "completed") ordersByStatus.completed = parseInt(r.count);
      if (r.status === "cancelled") ordersByStatus.cancelled = parseInt(r.count);
    });

    // Recent Orders (last 10 orders)
    const recentOrdersRes = await pool.query(`
      SELECT o.id, u.fullname AS user_name, o.total_amount, o.status, o.created_at
      FROM orders o
      JOIN users2 u ON o.user_id = u.id
      ORDER BY o.created_at DESC
      LIMIT 10
    `);

    res.render("admin/dashboard", {
      title: "Dashboard | JKT E-Commerce",
      description: "Shop quality products at affordable prices on JKT E-Commerce",
      keywords: "online shopping, jkt, ecommerce",
      ogImage: "/images/JKT logo bg.png",
      user: req.session.user,
      stats: {
        totalProducts,
        totalOrders,
        totalUsers,
        totalSales,
        pendingOrders,
        lowStock,
        newUsers,
        newOrders,
        salesByDate,
        ordersByStatus
      },
      recentOrders: recentOrdersRes.rows
    });

  } catch (err) {
    console.error("Error loading dashboard:", err);
    res.status(500).send("Error loading admin dashboard");
  }
};

exports.getProfile = async (req, res) => {
  try {
    // Assuming you stored user info in session after login
    const userId = req.session.user?.id;

    if (!userId) {
      return res.redirect("/login");
    }

    const result = await pool.query("SELECT * FROM users2 WHERE id = $1", [
      userId,
    ]);
    const user = result.rows[0];

    if (!user) {
      return res.status(404).send("User not found");
    }

    res.render("public/profile", { 
      user,
      title: "Profile | JKT E-Commerce",
      description: "Shop quality products at affordable prices on JKT E-Commerce",
      keywords: "online shopping, jkt, ecommerce",
      ogImage: "/images/JKT logo bg.png",
     }); // your ejs file for profile
      
  } catch (error) {
    console.error("❌ Error loading profile:", error);
    res.status(500).send("Server error");
  }
};

// ✅ Update Profile
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    if (!userId) return res.redirect("/auth/login");

    const { fullname, phone, address, city, state } = req.body;
    let profileImageUrl = null;

    if (req.file && req.file.path) {
      const upload = await cloudinary.uploader.upload(req.file.path, {
        folder: "JKT-ecommerce/users",
      });
      profileImageUrl = upload.secure_url;
    }

    await pool.query(
      `UPDATE users2 
       SET fullname = $1, phone = $2, address = $3, city = $4, state = $5,
           profile_image = COALESCE($6, profile_image)
       WHERE id = $7`,
      [fullname, phone, address, city, state, profileImageUrl, userId]
    );

    console.log("✅ Profile updated successfully");

    // Refresh session user data after update
    const updatedUser = await pool.query("SELECT * FROM users2 WHERE id = $1", [
      userId,
    ]);
    req.session.user = updatedUser.rows[0];

    res.redirect("/users/profile");
  } catch (err) {
    console.error("❌ Error updating profile:", err);
    res.status(500).send("Server error");
  }
};

// ✅ Admin: Get all users
exports.getAllUsers = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, fullname, email, role FROM users2 ORDER BY created_at DESC"
    );
    res.render("admin/users", { users: result.rows, user: req.session.user, title: "Users | JKT E-Commerce",
      description: "Manage users on JKT E-Commerce",
      keywords: "online shopping, jkt, ecommerce", 
      ogImage: "/images/JKT logo bg.png",  });
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).send("Server error");
  }
};

// ✅ Admin: Delete a user
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM users2 WHERE id = $1", [id]);
    res.redirect("/admin/users");
  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(500).send("Server error");
  }
};

exports.editUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { fullname, email, role } = req.body;

    await pool.query(
      "UPDATE users2 SET fullname = $1, email = $2, role = $3 WHERE id = $4",
      [fullname, email, role, id]
    );

    res.redirect("/admin/users");
  } catch (err) {
    console.error("Error updating user:", err);
    res.status(500).send("Server error");
  }
};

// Show all promotions in admin panel
exports.createPromotion = [
  upload.single("image"),
  async (req, res) => {
    try {
      const { title, discount } = req.body;
      let image_url = null;

      if (req.file) {
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: "promotions",
        });
        image_url = result.secure_url;
      }

      await pool.query(
        "INSERT INTO promotions (title, discount, image_url) VALUES ($1, $2, $3)",
        [title, discount, image_url]
      );
      res.redirect("/admin/promotions");
    } catch (err) {
      console.error(err);
      res.status(500).send("Error creating promotion");
    }
  },
];

// Show all testimonials in admin panel
exports.getTestimonials = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM testimonials ORDER BY created_at DESC"
    );
    res.render("admin/testimonials", {
      title: "Manage Testimonials | JKT E-Commerce",
      testimonials: result.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching testimonials");
  }
};

// Approve testimonial
exports.approveTestimonial = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("UPDATE testimonials SET is_approved = true WHERE id = $1", [id]);
    res.redirect("/admin/testimonials");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error approving testimonial");
  }
};

// Unapprove testimonial
exports.unapproveTestimonial = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("UPDATE testimonials SET is_approved = false WHERE id = $1", [id]);
    res.redirect("/admin/testimonials");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error unapproving testimonial");
  }
};
