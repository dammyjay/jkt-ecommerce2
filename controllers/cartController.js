const pool = require("../utils/db");
const { getPricing, priceCart, evaluateCoupon, round2 } = require("../utils/pricing");
const paystack = require("../utils/paystack");
const { loadOrder, markOrderPaid } = require("../utils/orderService");

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
      paystackEnabled: paystack.isConfigured(),
      user: userData,
      title: "Checkout | JKT E-Commerce",
    });
  } catch (err) {
    console.error("Error loading checkout:", err);
    res.status(500).send("Server error");
  }
};

const PAYMENT_METHODS = ["paystack", "bank_transfer"];

exports.placeOrder = async (req, res) => {
  const { fullname, email, phone, address, city, state, payment_method } = req.body;
  const summary = await priceCart(req);
  if (!summary.items.length) return res.redirect("/cart");

  const fail = msg => {
    req.session.checkoutError = msg;
    return res.redirect("/cart/checkout");
  };

  if (!PAYMENT_METHODS.includes(payment_method)) return fail("Please choose a payment method.");
  if (payment_method === "paystack" && !paystack.isConfigured()) {
    return fail("Card payment is temporarily unavailable. Please choose bank transfer.");
  }

  // Make sure everything is still in stock before taking money
  const stock = await pool.query(
    "SELECT id, name, stock FROM products WHERE id = ANY($1::int[])",
    [summary.items.map(i => i.product_id)]
  );
  const byId = new Map(stock.rows.map(p => [p.id, p]));
  for (const item of summary.items) {
    const p = byId.get(item.product_id);
    if (p && p.stock != null && Number(p.stock) < item.quantity) {
      return fail(Number(p.stock) > 0
        ? `Only ${p.stock} of "${p.name}" left. Please update your cart.`
        : `"${p.name}" just sold out. Please remove it from your cart.`);
    }
  }

  const userId = req.session.user?.id || null;
  let coupon = null, discount = 0;
  if (req.session.couponCode) {
    const result = await evaluateCoupon(req.session.couponCode, summary.subtotal, {
      items: summary.items, userId, email,
    });
    if (result.error) {
      delete req.session.couponCode;
      return fail(`Coupon removed: ${result.error}`);
    }
    coupon = result.coupon;
    discount = result.discount;
  }
  const total = round2(summary.subtotal - discount);
  const fullAddress = [address, city, state].filter(Boolean).join(", ");

  // 1. Save the order as unpaid
  const client = await pool.connect();
  let orderId, orderNumber;
  try {
    await client.query("BEGIN");
    const order = await client.query(
      `INSERT INTO orders
        (user_id, customer_name, customer_phone, customer_email, address, payment_method,
         subtotal_amount, discount_amount, coupon_code, total_amount, status, payment_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending','unpaid')
       RETURNING id`,
      [userId, fullname, phone, email, fullAddress, payment_method,
       summary.subtotal, discount, coupon?.code || null, total]
    );
    orderId = order.rows[0].id;
    orderNumber = `ORD-${String(orderId).padStart(6, "0")}`;
    await client.query("UPDATE orders SET order_number = $1 WHERE id = $2", [orderNumber, orderId]);

    for (const item of summary.items) {
      await client.query(
        "INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1,$2,$3,$4)",
        [orderId, item.product_id, item.quantity, item.price]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error placing order:", err);
    return fail("Could not place your order. Please try again.");
  } finally {
    client.release();
  }

  // 2a. Bank transfer: done. Admin marks it paid when the money arrives.
  if (payment_method === "bank_transfer") {
    req.session.cart = { items: [], totalQty: 0, totalPrice: 0 };
    delete req.session.couponCode;
    return res.render("public/orderSuccess", {
      title: "Order Placed | JKT E-Commerce",
      user: req.session.user,
      order: await loadOrder(orderId),
    });
  }

  // 2b. Paystack: send the customer to pay. The cart is kept until payment succeeds.
  try {
    const reference = `${orderNumber}-${Date.now().toString(36)}`.toUpperCase();
    const base = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
    const tx = await paystack.initializeTransaction({
      email,
      amount: total,
      reference,
      callbackUrl: `${base}/cart/payment/callback`,
      metadata: { order_id: orderId, order_number: orderNumber },
    });
    await pool.query("UPDATE orders SET payment_reference = $1 WHERE id = $2", [reference, orderId]);
    req.session.pendingOrderId = orderId;
    req.session.save(() => res.redirect(tx.authorization_url));
  } catch (err) {
    console.error("Paystack initialize failed:", err.message);
    await pool.query("UPDATE orders SET payment_status = 'failed' WHERE id = $1", [orderId]);
    fail("We couldn't start the payment. Please try again or choose bank transfer.");
  }
};

/**
 * Confirm a Paystack payment with Paystack itself (never trust the browser)
 * and mark the matching order paid. Used by the redirect and the webhook.
 */
async function confirmPaystackPayment(reference) {
  const { rows } = await pool.query("SELECT * FROM orders WHERE payment_reference = $1", [reference]);
  const order = rows[0];
  if (!order) return { ok: false, reason: "Order not found" };
  if (order.payment_status === "paid") return { ok: true, orderId: order.id };

  const tx = await paystack.verifyTransaction(reference);
  const expectedKobo = Math.round(Number(order.total_amount) * 100);

  if (tx.status !== "success") {
    if (["failed", "abandoned", "reversed"].includes(tx.status)) {
      await pool.query(
        "UPDATE orders SET payment_status = 'failed' WHERE id = $1 AND payment_status IS DISTINCT FROM 'paid'",
        [order.id]
      );
    }
    return { ok: false, orderId: order.id, reason: tx.gateway_response || tx.status };
  }
  if (Number(tx.amount) !== expectedKobo || tx.currency !== "NGN") {
    console.error(`⚠️ Amount mismatch on ${reference}: paid ${tx.amount} ${tx.currency}, expected ${expectedKobo} NGN`);
    await pool.query("UPDATE orders SET payment_status = 'review' WHERE id = $1", [order.id]);
    return { ok: false, orderId: order.id, reason: "Payment amount did not match the order. Our team will contact you." };
  }

  await markOrderPaid(order.id, { reference, channel: tx.channel });
  return { ok: true, orderId: order.id };
}
exports.confirmPaystackPayment = confirmPaystackPayment;

exports.paymentCallback = async (req, res) => {
  const reference = String(req.query.reference || req.query.trxref || "");
  if (!reference) return res.redirect("/cart");

  try {
    const result = await confirmPaystackPayment(reference);
    if (result.ok) {
      if (req.session.pendingOrderId === result.orderId) {
        req.session.cart = { items: [], totalQty: 0, totalPrice: 0 };
        delete req.session.couponCode;
        delete req.session.pendingOrderId;
      }
      return res.render("public/orderSuccess", {
        title: "Payment Successful | JKT E-Commerce",
        user: req.session.user,
        order: await loadOrder(result.orderId),
      });
    }
    req.session.checkoutError =
      `Payment was not completed${result.reason ? ` (${result.reason})` : ""}. Your cart is saved, so you can try again.`;
    res.redirect("/cart/checkout");
  } catch (err) {
    console.error("Payment callback error:", err);
    req.session.checkoutError =
      "We couldn't confirm your payment yet. If you were charged, we'll confirm it shortly and email you.";
    res.redirect("/cart/checkout");
  }
};

/** Paystack server-to-server notification. Needs the raw request body. */
exports.paystackWebhook = async (req, res) => {
  if (!Buffer.isBuffer(req.body) || !paystack.isValidWebhook(req.body, req.get("x-paystack-signature"))) {
    return res.sendStatus(401);
  }
  res.sendStatus(200); // acknowledge fast; Paystack retries otherwise

  try {
    const event = JSON.parse(req.body.toString("utf8"));
    if (event.event === "charge.success" && event.data?.reference) {
      const result = await confirmPaystackPayment(event.data.reference);
      if (!result.ok) console.warn("Webhook payment not confirmed:", event.data.reference, result.reason);
    }
  } catch (err) {
    console.error("Paystack webhook error:", err);
  }
};
