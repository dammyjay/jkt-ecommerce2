const pool = require("../utils/db");
const { getPricing, priceCart, evaluateCoupon, round2 } = require("../utils/pricing");

function ensureCart(req) {
  if (!req.session.cart) req.session.cart = { items: [], totalQty: 0, totalPrice: 0 };
  return req.session.cart;
}

exports.getCart = async (req, res) => {
  try {
    const summary = await priceCart(req);
    res.render("public/cart", {
      cart: req.session.cart,
      summary,
      user: req.session.user,
      title: "Your Cart | JKT E-Commerce",
    });
  } catch (err) {
    console.error("Error loading cart:", err);
    res.status(500).send("Server error");
  }
};

exports.addToCart = async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    let quantity = Math.max(parseInt(req.body.quantity) || 1, 1);
    const cart = ensureCart(req);

    const { rows } = await pool.query("SELECT * FROM products WHERE id = $1", [productId]);
    if (!rows.length) return res.status(404).json({ error: "Product not found" });
    const prod = rows[0];

    const existing = cart.items.find(i => i.product_id === productId);
    const already = existing ? existing.quantity : 0;
    const stock = prod.stock == null ? Infinity : Number(prod.stock);
    if (already + quantity > stock) {
      return res.status(400).json({
        error: stock - already > 0
          ? `Only ${stock - already} more available`
          : "No more stock available for this item",
      });
    }

    const pr = getPricing(prod);
    if (existing) {
      existing.quantity += quantity;
    } else {
      cart.items.push({
        product_id: prod.id,
        name: prod.name,
        price: pr.price,
        original_price: pr.original,
        on_sale: pr.onSale,
        image_url: prod.image_url,
        quantity,
      });
    }

    const summary = await priceCart(req);
    res.json({ success: true, message: `${prod.name} added to cart!`, cart, summary });
  } catch (err) {
    console.error("Error adding to cart:", err);
    res.status(500).json({ error: "Server error" });
  }
};

exports.updateCart = async (req, res) => {
  try {
    const productId = parseInt(req.body.product_id);
    const quantity = Math.max(parseInt(req.body.quantity) || 1, 1);
    const cart = req.session.cart;
    if (!cart) return res.status(400).json({ error: "Cart is empty" });

    const item = cart.items.find(i => i.product_id === productId);
    if (!item) return res.status(404).json({ error: "Item not found" });

    const { rows } = await pool.query("SELECT stock FROM products WHERE id = $1", [productId]);
    const stock = rows[0]?.stock == null ? Infinity : Number(rows[0].stock);
    item.quantity = Math.min(quantity, stock);

    const summary = await priceCart(req);
    res.json({ success: true, cart, summary, capped: item.quantity < quantity });
  } catch (err) {
    console.error("Error updating cart:", err);
    res.status(500).json({ error: "Server error" });
  }
};

exports.removeItem = async (req, res) => {
  try {
    const productId = parseInt(req.body.product_id);
    const cart = req.session.cart;
    if (!cart) return res.status(400).json({ error: "Cart is empty" });

    cart.items = cart.items.filter(i => i.product_id !== productId);
    const summary = await priceCart(req);
    res.json({ success: true, cart, summary });
  } catch (err) {
    console.error("Error removing cart item:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// ---------- Coupons ----------

exports.applyCoupon = async (req, res) => {
  try {
    const code = String(req.body.code || "").trim();
    const summary = await priceCart(req);
    if (!summary.items.length) return res.status(400).json({ error: "Your cart is empty" });

    const result = await evaluateCoupon(code, summary.subtotal, {
      items: summary.items,
      userId: req.session.user?.id || null,
      email: req.session.user?.email || null,
    });
    if (result.error) return res.status(400).json({ error: result.error });

    req.session.couponCode = result.coupon.code;
    const updated = await priceCart(req);
    res.json({ success: true, message: `Coupon ${result.coupon.code} applied`, summary: updated });
  } catch (err) {
    console.error("Error applying coupon:", err);
    res.status(500).json({ error: "Server error" });
  }
};

exports.removeCoupon = async (req, res) => {
  delete req.session.couponCode;
  const summary = await priceCart(req);
  res.json({ success: true, summary });
};

// ---------- Checkout ----------

exports.getCheckout = async (req, res) => {
  try {
    const summary = await priceCart(req);
    if (!summary.items.length) return res.redirect("/cart");

    let userData = {};
    if (req.session.user) {
      const result = await pool.query(
        "SELECT fullname, email, phone, address, city, state FROM users2 WHERE id = $1",
        [req.session.user.id]
      );
      if (result.rows.length) userData = result.rows[0];
    }

    const checkoutError = req.session.checkoutError || null;
    delete req.session.checkoutError;

    res.render("public/checkout", {
      cart: req.session.cart,
      summary,
      checkoutError,
      user: userData,
      title: "Checkout | JKT E-Commerce",
    });
  } catch (err) {
    console.error("Error loading checkout:", err);
    res.status(500).send("Server error");
  }
};

exports.placeOrder = async (req, res) => {
  const { fullname, email, phone, address, city, state, payment_method } = req.body;
  const summary = await priceCart(req);
  if (!summary.items.length) return res.redirect("/cart");

  const userId = req.session.user?.id || null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Re-validate coupon inside the transaction with a row lock so usage limits hold
    let coupon = null, discount = 0;
    if (req.session.couponCode) {
      const result = await evaluateCoupon(req.session.couponCode, summary.subtotal, {
        items: summary.items, userId, email, client, lock: true,
      });
      if (result.error) {
        await client.query("ROLLBACK");
        delete req.session.couponCode;
        req.session.checkoutError = `Coupon removed: ${result.error}`;
        return res.redirect("/cart/checkout");
      }
      coupon = result.coupon;
      discount = result.discount;
    }

    const total = round2(summary.subtotal - discount);
    const fullAddress = [address, city, state].filter(Boolean).join(", ");

    const order = await client.query(
      `INSERT INTO orders
        (user_id, customer_name, customer_phone, customer_email, address, payment_method,
         subtotal_amount, discount_amount, coupon_code, total_amount, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending')
       RETURNING id`,
      [userId, fullname, phone, email, fullAddress, payment_method,
       summary.subtotal, discount, coupon?.code || null, total]
    );
    const orderId = order.rows[0].id;
    const orderNumber = `ORD-${String(orderId).padStart(6, "0")}`;
    await client.query("UPDATE orders SET order_number = $1 WHERE id = $2", [orderNumber, orderId]);

    for (const item of summary.items) {
      await client.query(
        "INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1,$2,$3,$4)",
        [orderId, item.product_id, item.quantity, item.price]
      );
    }

    if (coupon) {
      await client.query("UPDATE coupons SET used_count = used_count + 1 WHERE id = $1", [coupon.id]);
      await client.query(
        `INSERT INTO coupon_redemptions (coupon_id, order_id, user_id, email, discount_amount)
         VALUES ($1,$2,$3,$4,$5)`,
        [coupon.id, orderId, userId, email, discount]
      );
    }

    await client.query("COMMIT");

    req.session.cart = { items: [], totalQty: 0, totalPrice: 0 };
    delete req.session.couponCode;

    res.render("public/orderSuccess", {
      title: "Order Placed | JKT E-Commerce",
      user: req.session.user,
      orderNumber,
      summary: { ...summary, discount, total, coupon: coupon && { code: coupon.code } },
      payment_method,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error placing order:", err);
    res.status(500).send("Could not place your order. Please try again.");
  } finally {
    client.release();
  }
};
