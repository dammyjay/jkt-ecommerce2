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
    const ordersResult = await pool.query(`
      SELECT 
        o.*,
        COALESCE(u.fullname, o.customer_name) AS customer_name,
        a.fullname AS issued_by_name
      FROM orders o
      LEFT JOIN users2 u ON o.user_id = u.id
      LEFT JOIN users2 a ON o.issued_by = a.id
      ORDER BY o.created_at DESC
    `);


    const usersResult = await pool.query(`
      SELECT id, fullname, phone
      FROM users2
      ORDER BY fullname ASC
    `);

    // Fetch all products
    const productsResult = await pool.query(`
      SELECT id, name, price
      FROM products
      ORDER BY name ASC
    `);
    res.render("admin/orders", {
      orders: ordersResult.rows,
      users: usersResult.rows, // ✅ list of customers
      products: productsResult.rows,  // ✅ list of products
      user: req.session.user,  // ✅ logged-in admin
      title: "Manage Orders | JKT E-Commerce",

    });
  } catch (error) {
    console.error("Error fetching admin orders:", error);
    res.status(500).send("Server error");
  }
};

exports.getOrderItems = async (req, res) => {
  try {
    const orderId = req.params.id;

    const result = await pool.query(
      `
      SELECT 
        oi.id,
        oi.product_id,
        p.name AS product_name,
        oi.quantity,
        oi.price
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = $1
      `,
      [orderId]
    );

    res.json({
      items: result.rows
    });
  } catch (err) {
    console.error("Error loading order items:", err);
    res.status(500).json({ error: "Failed to load order items" });
  }
};


exports.getOrderForEdit = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Get order info
    const orderResult = await db.query(`
      SELECT 
        o.id,
        o.order_number,
        o.customer_name,
        o.customer_phone,
        o.address,
        o.total_amount,
        o.status
      FROM orders o
      WHERE o.id = $1
    `, [id]);

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // 2. Get order items
    const itemsResult = await db.query(`
      SELECT 
        oi.id,
        oi.product_id,
        p.name AS product_name,
        oi.quantity,
        oi.price
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = $1
    `, [id]);

    res.json({
      order: orderResult.rows[0],
      items: itemsResult.rows
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load order' });
  }
};

// Admin update status
exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    await pool.query(
      "UPDATE orders SET status = $1 WHERE id = $2 AND deleted IS NOT TRUE",
      [status, id]
    );
    res.redirect("/orders/admin/manage");
  } catch (error) {
    console.error("Error updating order:", error);
    res.status(500).send("Server error");
  }
};

// Admin delete
exports.deleteOrder = async (req, res) => {
  try {
    await pool.query("UPDATE orders SET status = 'deleted', deleted = true WHERE id = $1", [req.params.id]);
    res.redirect("/orders/admin/manage");
  } catch (error) {
    console.error("Error deleting order:", error);
    res.status(500).send("Server error");
  }
};

exports.adminCreateOrder = async (req, res) => {
  try {
    let { user_id, manual_customer_name, customer_name, customer_phone, items, address, total_amount } = req.body;
    const totalAmount = Number(total_amount) || 0;
    // Decide final name
    const finalCustomerName =
    customer_name || manual_customer_name || null;

    // Normalize user_id
    if (!user_id || user_id === "manual" || user_id === "") {
      user_id = null;
    } else {
      user_id = parseInt(user_id, 10);

      // 🔐 Verify user exists
      const userCheck = await pool.query(
        "SELECT id FROM users WHERE id = $1",
        [user_id]
      );

      if (userCheck.rowCount === 0) {
        user_id = null; // fallback to manual
      }
    }

    const issuedBy = req.session.user.id;


    const order = await pool.query(
      `INSERT INTO orders 
        (user_id, customer_name, customer_phone, address, created_by_admin, issued_by, total_amount)
      VALUES ($1, $2, $3, $4, true, $5, $6)
      RETURNING id`,
      [
        user_id,
        finalCustomerName,
        customer_phone || null,
        address,
        issuedBy,
        totalAmount
      ]
    );

    // const orderId = order.rows[0].id;

    // After inserting order
    const orderId = order.rows[0].id;

    // Generate order number
    const orderNumber = `ORD-${String(orderId).padStart(6, "0")}`;

    await pool.query(
      "UPDATE orders SET order_number = $1 WHERE id = $2",
      [orderNumber, orderId]
    );


    for (let item of items) {
      await pool.query(
        `INSERT INTO order_items 
         (order_id, product_id, quantity, price)
         VALUES ($1, $2, $3, $4)`,
        [orderId, item.product_id, item.quantity, item.price]
      );
    }

        // ✅ CORRECT REDIRECT
   res.redirect(`/orders/admin/${orderId}`);

  } catch (err) {
    console.error(err);
    res.status(500).send("Error creating order");
  }
};

exports.getOrderDetailsModal = async (req, res) => {
  try {
    const orderId = req.params.id;

    const orderResult = await pool.query(
      `
      SELECT 
        o.*,
        COALESCE(u.fullname, o.customer_name) AS customer_name
      FROM orders o
      LEFT JOIN users2 u ON o.user_id = u.id
      WHERE o.id = $1
      `,
      [orderId]
    );

    if (orderResult.rowCount === 0) {
      return res.status(404).send("Order not found");
    }

    const itemsResult = await pool.query(
      `
      SELECT oi.*, p.name
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = $1
      `,
      [orderId]
    );

    res.render("partials/orderDetails", {
      order: orderResult.rows[0],
      items: itemsResult.rows,
    });
  } catch (err) {
    console.error("Error loading order details:", err);
    res.status(500).send("Server error");
  }
};

exports.updateOrderItems = async (req, res) => {
  try {
    const { id } = req.params;
    let { items, total_amount } = req.body;

    // 🔥 Normalize items (object → array)
    if (!Array.isArray(items)) {
      items = Object.values(items);
    }

    // Safety check
    if (!items || items.length === 0) {
      return res.status(400).json({ error: "No items provided" });
    }

    // Remove old items
    await pool.query(
      "DELETE FROM order_items WHERE order_id = $1",
      [id]
    );

    // Insert updated items
    for (const item of items) {
      await pool.query(
        `
        INSERT INTO order_items (order_id, product_id, quantity, price)
        VALUES ($1, $2, $3, $4)
        `,
        [id, item.product_id, item.quantity, item.price]
      );
    }

    // Update total
    await pool.query(
      "UPDATE orders SET total_amount = $1 WHERE id = $2",
      [total_amount, id]
    );

    // res.json({ success: true });
    res.redirect("/orders/admin/manage");
  } catch (err) {
    console.error("Update order items error:", err);
    res.status(500).json({ error: "Failed to update order items" });
  }
};
