const pool = require("../utils/db");
// const path = require('path');
// const fs = require('fs');
// const ejs = require('ejs');
// const pdf = require('html-pdf');
const puppeteer = require("puppeteer");
const html_to_pdf = require("html-pdf-node");


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
        COALESCE(u.fullname, o.customer_name) AS customer_name,
        a.fullname AS issued_by_name
      FROM orders o
      LEFT JOIN users2 u ON o.user_id = u.id
      LEFT JOIN users2 a ON o.issued_by = a.id
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


exports.downloadInvoice = async (req, res) => {
  try {
    const orderId = req.params.id;

    const orderResult = await pool.query(
      `
      SELECT o.*, 
             COALESCE(u.fullname, o.customer_name) AS customer_name,
             a.fullname AS issued_by_name
      FROM orders o
      LEFT JOIN users2 u ON u.id = o.user_id
      LEFT JOIN users2 a ON o.issued_by = a.id
      WHERE o.id = $1 AND o.deleted = false
      `,
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).send("Order not found");
    }

    const itemsResult = await pool.query(
      `
      SELECT oi.quantity, oi.price, p.name
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = $1
      `,
      [orderId]
    );

    const order = orderResult.rows[0];
    const items = itemsResult.rows;

    const TAX_RATE = 0.075;

    let subTotal = 0;
    let totalTax = 0;

    items.forEach(item => {
      // const itemTotal = item.quantity * item.price;
      // const itemTax = itemTotal * TAX_RATE;
      // subTotal += itemTotal;
      // totalTax += itemTax;

      const eachTax = item.price * TAX_RATE;
          const eachPriceWithoutTax = item.price - eachTax;
          const quantity = item.quantity;
          const priceWithoutTaxTotal = eachPriceWithoutTax * quantity;
          const itemTotal = item.quantity * item.price;
          const itemTax = itemTotal * TAX_RATE;
          subTotal += priceWithoutTaxTotal;
          totalTax += itemTax;
    });

    const grandTotal = subTotal + totalTax;

    const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          body {
            font-family: Calibri, sans-serif;
            padding: 40px;
          }

          .watermark {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            opacity: 0.06;
            z-index: 0;
            text-align: center;
          }

          .watermark img {
            width: 300px;
          }

          .content {
            position: relative;
            z-index: 2;
          }
          
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }
          
          td {
            padding: 8px;
            text-align: left;
          }

          th {
            border: 1px solid #ccc;
            padding: 8px;
            text-align: left;
          }

          th {
            background: #000000;
            color: #ffffff;
          }

          .totals {
            margin-top: 20px;
            text-align: right;
          }

          .totals p {
            margin: 5px 0;
          }
        </style>
      </head>

      <body>
        <div class="watermark">
          <img src="https://shopify.jkthub.com/images/JKT logo.png" />
        </div>

        <div class="content">
          <img src="https://shopify.jkthub.com/images/JKT logo.png" alt="JKT Logo" width="60" height="60" />
          <h1 style="color: #6f520c;">JKT Hub Shopify</h1>
          <p>123 E-Commerce St., Lagos, Nigeria<br />
          <strong>Email:</strong> jaykirchtechhub@gmail.com<br />
          <strong>Phone:</strong> +234 916 766 7242</p>

          <h2 style="color: #6f520c;">Invoice</h2>
          <p><strong style="color: #6f520c;">Order No:</strong> ${order.order_number}</p>
          <p><strong style="color: #6f520c;">Customer:</strong> ${order.customer_name}</p>
          <p><strong style="color: #6f520c;">Phone:</strong> ${order.customer_phone || "N/A"}</p>
          <p><strong style="color: #6f520c;">Address:</strong> ${order.address || "N/A"}</p>
          <p><strong style="color: #6f520c;">Issued by:</strong> ${order.issued_by_name}</p>
          <p><strong style="color: #6f520c;">Date:</strong> ${new Date(order.created_at).toDateString()}</p>

          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Unit Price</th>
                <th>Tax 7.5%</th>
                <th>Unit total</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(item => {
                const eachItemTotal = item.quantity * item.price;
                const itemTotal = item.price;
                const itemTax = itemTotal * TAX_RATE;

                return `
                  <tr>
                    <td>${item.name}</td>
                    <td>${item.quantity}</td>
                    <td>₦${item.price - itemTax}</td>
                    <td>₦${itemTax}</td>
                    <td>₦${itemTotal}</td>
                    <td>₦${(eachItemTotal)}</td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>

          <div class="totals">
            <p><strong style="color: #6f520c;">Subtotal:</strong> ₦${subTotal.toFixed(2)}</p>
            <p><strong style="color: #6f520c;">Tax:</strong> ₦${totalTax.toFixed(2)}</p>
            <h3><strong style="color: #6f520c;">Grand Total:</strong> ₦${grandTotal.toFixed(2)}</h3>
          </div>
        </div>
      </body>
    </html>
    `;

    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
    });

    await browser.close();

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoice-${order.order_number}.pdf"`,
    });

    res.send(pdfBuffer);

  } catch (err) {
    console.error("Invoice PDF error:", err);
    res.status(500).send("Failed to generate invoice");
  }
};


//   const { id } = req.params;

//   const orderResult = await pool.query(`
//     SELECT o.*, u.fullname
//     FROM orders o
//     LEFT JOIN users u ON u.id = o.user_id
//     WHERE o.id = $1
//   `, [id]);

//   const itemsResult = await pool.query(`
//     SELECT oi.quantity, oi.price, p.name
//     FROM order_items oi
//     JOIN products p ON p.id = oi.product_id
//     WHERE oi.order_id = $1
//   `, [id]);

//   const order = orderResult.rows[0];
//   const items = itemsResult.rows;

//   const html = await ejs.renderFile(
//     path.join(__dirname, '../views/invoice.ejs'),
//     { order, items }
//   );

//   const options = { format: 'A4' };

//   pdf.create(html, options).toStream((err, stream) => {
//     if (err) return res.status(500).send('Invoice error');

//     res.setHeader('Content-Type', 'application/pdf');
//     res.setHeader(
//       'Content-Disposition',
//       `attachment; filename=invoice-${order.order_number}.pdf`
//     );

//     stream.pipe(res);
//   });
// };