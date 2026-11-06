// Customer-facing "My Orders": list, detail/tracking, pay now, reorder.
const pool = require("../utils/db");
const paystack = require("../utils/paystack");
const { loadOrder, bankDetails, payByDate } = require("../utils/orderService");

// An order belongs to the logged-in customer if it was placed from their
// account, or placed while logged out using their account email.
const OWNER_SQL = "(o.user_id = $1 OR ($2::text IS NOT NULL AND LOWER(o.customer_email) = LOWER($2)))";

/** What the customer sees: label, colours, and where the order is on the timeline (0–3). */
function customerStatus(o) {
  const paid = o.payment_status === "paid";
  if (o.payment_status === "expired") return { label: "Cancelled — not paid", color: "#6b7280", bg: "#f3f4f6", step: -1 };
  if (o.status === "cancelled") return { label: "Cancelled", color: "#6b7280", bg: "#f3f4f6", step: -1 };
  if (o.status === "completed") return { label: "Completed", color: "#15803d", bg: "#f0fdf4", step: 3 };
  if (o.payment_status === "review") return { label: "Payment under review", color: "#b45309", bg: "#fffbeb", step: 0 };
  if (paid || o.status === "processing") return { label: "Processing", color: "#1d4ed8", bg: "#eff6ff", step: paid ? 2 : 0 };
  if (o.payment_status === "failed") return { label: "Payment failed", color: "#b91c1c", bg: "#fef2f2", step: 0 };
  return { label: "Awaiting payment", color: "#b45309", bg: "#fffbeb", step: 0 };
}

function owner(req) {
  return [req.session.user.id, req.session.user.email || null];
}

async function findOwnOrder(req, id) {
  const { rows } = await pool.query(
    `SELECT o.id FROM orders o WHERE o.id = $3 AND o.deleted IS NOT TRUE AND ${OWNER_SQL}`,
    [...owner(req), id]
  );
  return rows.length ? loadOrder(id) : null;
}

exports.list = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT o.*,
              COALESCE(SUM(oi.quantity), 0)::int AS items_count,
              (ARRAY_AGG(p.image_url ORDER BY oi.id) FILTER (WHERE p.image_url IS NOT NULL))[1:3] AS images,
              (ARRAY_AGG(p.name ORDER BY oi.id))[1] AS first_item
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE o.deleted IS NOT TRUE AND ${OWNER_SQL}
       GROUP BY o.id
       ORDER BY o.created_at DESC`,
      owner(req)
    );
    res.render("orders/list", {
      title: "My Orders | JKT E-Commerce",
      description: "View your orders on JKT E-Commerce",
      orders: rows.map(o => ({ ...o, display: customerStatus(o) })),
      user: req.session.user,
    });
  } catch (err) {
    console.error("Error loading my orders:", err);
    res.status(500).send("Server error");
  }
};

exports.detail = async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return next();
  try {
    const order = await findOwnOrder(req, id);
    if (!order) return res.status(404).send("Order not found");

    const flash = req.session.orderFlash || null;
    delete req.session.orderFlash;

    res.render("orders/detail", {
      title: `Order ${order.order_number} | JKT E-Commerce`,
      order: { ...order, display: customerStatus(order) },
      bank: bankDetails(),
      payBy: payByDate(order),
      paystackEnabled: paystack.isConfigured(),
      flash,
      user: req.session.user,
    });
  } catch (err) {
    console.error("Error loading order:", err);
    res.status(500).send("Server error");
  }
};

/** Retry or switch to online payment for an unpaid order. */
exports.payNow = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const back = msg => {
    req.session.orderFlash = msg;
    res.redirect(`/orders/${id}`);
  };
  try {
    const order = await findOwnOrder(req, id);
    if (!order) return res.status(404).send("Order not found");
    if (order.payment_status === "paid") return back("This order is already paid.");
    if (order.status !== "pending") return back("This order can no longer be paid online. Please contact us.");
    if (!paystack.isConfigured()) return back("Online payment is not available right now.");

    // Make sure items are still in stock before taking money
    const short = await pool.query(
      `SELECT p.name FROM order_items oi JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = $1 AND p.stock IS NOT NULL AND p.stock < oi.quantity`,
      [id]
    );
    if (short.rows.length) {
      return back(`Sorry, "${short.rows[0].name}" no longer has enough stock. Please place a new order.`);
    }

    const reference = `${order.order_number}-${Date.now().toString(36)}`.toUpperCase();
    const base = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
    const tx = await paystack.initializeTransaction({
      email: order.customer_email || req.session.user.email,
      amount: order.total_amount,
      reference,
      callbackUrl: `${base}/cart/payment/callback`,
      metadata: { order_id: order.id, order_number: order.order_number },
    });
    await pool.query(
      "UPDATE orders SET payment_reference = $1, payment_method = 'paystack', payment_status = 'unpaid' WHERE id = $2",
      [reference, id]
    );
    res.redirect(tx.authorization_url);
  } catch (err) {
    console.error("Pay now failed:", err);
    back("We couldn't start the payment. Please try again.");
  }
};

exports.customerStatus = customerStatus;

/** Put the items of a past order back in the cart (current prices apply). */
exports.reorder = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const order = await findOwnOrder(req, id);
    if (!order) return res.status(404).send("Order not found");

    const { rows } = await pool.query(
      `SELECT oi.product_id, SUM(oi.quantity)::int AS quantity, p.name, p.image_url, p.price, p.stock
       FROM order_items oi JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = $1
       GROUP BY oi.product_id, p.name, p.image_url, p.price, p.stock`,
      [id]
    );

    if (!req.session.cart) req.session.cart = { items: [], totalQty: 0, totalPrice: 0 };
    const cart = req.session.cart;
    const skipped = [];

    for (const p of rows) {
      const inCart = cart.items.find(i => i.product_id === p.product_id);
      const already = inCart ? inCart.quantity : 0;
      const available = p.stock == null ? Infinity : Math.max(Number(p.stock) - already, 0);
      const qty = Math.min(p.quantity, available);
      if (qty <= 0) { skipped.push(p.name); continue; }
      if (inCart) inCart.quantity += qty;
      // Price is refreshed by priceCart() when the cart is shown
      else cart.items.push({ product_id: p.product_id, name: p.name, image_url: p.image_url, price: Number(p.price), original_price: Number(p.price), quantity: qty });
      if (qty < p.quantity) skipped.push(`${p.name} (only ${qty} available)`);
    }

    req.session.cartNotice = skipped.length
      ? `Added to cart. Not fully available: ${skipped.join(", ")}.`
      : "All items from your order were added to your cart.";
    res.redirect("/cart");
  } catch (err) {
    console.error("Reorder failed:", err);
    res.status(500).send("Server error");
  }
};
