const pool = require("../utils/db");
// ✅ User: Place order
exports.placeOrder = async (req, res) => {
  try {
    const { user_id, product_id, quantity, total_price, address } = req.body;
    await pool.query(
      "INSERT INTO orders (user_id, product_id, quantity, total_price, address, status) VALUES ($1, $2, $3, $4, $5, 'pending')",
      [user_id, product_id, quantity, total_price, address]
    );
    res.redirect("/orders");
  } catch (err) {
    console.error("Error placing order:", err);
    res.status(500).send("Server error");
  }
};

// 👤 User: View own orders
exports.getUserOrders = async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM orders WHERE user_id = $1", [
      req.session.user.id,
    ]);
    res.render("orders/list", { orders: result.rows, user: req.session.user, title: "My Orders | JKT E-Commerce",
    description: "View your orders on JKT E-Commerce",
    keywords: "my orders, user orders, jkt ecommerce",
    ogImage: "/images/JKT logo bg.png", });
  } catch (error) {
    console.error("Error fetching user orders:", error);
    res.status(500).send("Server error");
  }
};

// 🧑‍💼 Admin: Manage all orders
exports.getAllOrdersAdmin = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM orders ORDER BY created_at DESC"
    );
    res.render("admin/orders", { orders: result.rows, user: req.session.user, title: "Manage Orders | JKT E-Commerce",
    description: "Manage all orders on JKT E-Commerce",
    keywords: "admin orders, manage orders, jkt ecommerce",
    ogImage: "/images/JKT logo bg.png", });
  } catch (error) {
    console.error("Error fetching admin orders:", error);
    res.status(500).send("Server error");
  }
};

// Admin update status
exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    await pool.query("UPDATE orders SET status = $1 WHERE id = $2", [
      status,
      id,
    ]);
    res.redirect("/orders/admin/manage");
  } catch (error) {
    console.error("Error updating order:", error);
    res.status(500).send("Server error");
  }
};

// Admin delete
exports.deleteOrder = async (req, res) => {
  try {
    await pool.query("DELETE FROM orders WHERE id = $1", [req.params.id]);
    res.redirect("/orders/admin/manage");
  } catch (error) {
    console.error("Error deleting order:", error);
    res.status(500).send("Server error");
  }
};
