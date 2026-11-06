// What happens when an order is paid — shared by the Paystack redirect,
// the Paystack webhook, and the admin "Mark as paid" button.
const pool = require("./db");
const sendEmail = require("./sendEmail");
const { formatNaira } = require("./pricing");

/** Load an order with its items, for receipts and emails. */
async function loadOrder(orderId) {
  const order = await pool.query("SELECT * FROM orders WHERE id = $1", [orderId]);
  if (!order.rows.length) return null;
  const items = await pool.query(
    `SELECT oi.quantity, oi.price, p.name, p.image_url
     FROM order_items oi
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = $1
     ORDER BY oi.id`,
    [orderId]
  );
  return { ...order.rows[0], items: items.rows };
}

/**
 * Mark an order paid exactly once. Safe to call repeatedly (redirect + webhook
 * often both arrive): only the first call reduces stock and records coupon use.
 * Returns { order, alreadyPaid }.
 */
async function markOrderPaid(orderId, { reference = null, channel = null } = {}) {
  const client = await pool.connect();
  let order;
  try {
    await client.query("BEGIN");

    const updated = await client.query(
      `UPDATE orders
         SET payment_status = 'paid', paid_at = NOW(),
             payment_reference = COALESCE($2, payment_reference),
             payment_channel = COALESCE($3, payment_channel),
             -- a late payment revives an auto-cancelled order
             status = CASE WHEN status IN ('pending', 'cancelled') THEN 'processing' ELSE status END
       WHERE id = $1 AND payment_status IS DISTINCT FROM 'paid'
       RETURNING *`,
      [orderId, reference, channel]
    );

    if (!updated.rows.length) {
      await client.query("ROLLBACK");
      return { order: await loadOrder(orderId), alreadyPaid: true };
    }
    order = updated.rows[0];

    // Reduce stock
    await client.query(
      `UPDATE products p
         SET stock = GREATEST(COALESCE(p.stock, 0) - oi.qty, 0)
       FROM (SELECT product_id, SUM(quantity) AS qty FROM order_items WHERE order_id = $1 GROUP BY product_id) oi
       WHERE p.id = oi.product_id`,
      [orderId]
    );

    // Record coupon use
    if (order.coupon_code) {
      const c = await client.query(
        "UPDATE coupons SET used_count = used_count + 1 WHERE UPPER(code) = UPPER($1) RETURNING id",
        [order.coupon_code]
      );
      if (c.rows.length) {
        await client.query(
          `INSERT INTO coupon_redemptions (coupon_id, order_id, user_id, email, discount_amount)
           VALUES ($1, $2, $3, $4, $5)`,
          [c.rows[0].id, order.id, order.user_id, order.customer_email, order.discount_amount || 0]
        );
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  const full = await loadOrder(orderId);
  sendOrderEmails(full).catch(err => console.error("Order email failed:", err.message));
  return { order: full, alreadyPaid: false };
}

// ---------- Emails ----------

function itemsTable(order) {
  const rows = order.items.map(i => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #eee">${escapeHtml(i.name || "Item")} × ${i.quantity}</td>
      <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right">${formatNaira(i.price * i.quantity)}</td>
    </tr>`).join("");
  const discount = Number(order.discount_amount) > 0
    ? `<tr><td style="padding:6px 0;color:#15803d">Coupon (${escapeHtml(order.coupon_code)})</td>
         <td style="padding:6px 0;text-align:right;color:#15803d">-${formatNaira(order.discount_amount)}</td></tr>`
    : "";
  return `
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      ${rows}
      <tr><td style="padding:8px 0">Subtotal</td><td style="padding:8px 0;text-align:right">${formatNaira(order.subtotal_amount ?? order.total_amount)}</td></tr>
      ${discount}
      <tr><td style="padding:8px 0;font-weight:700;font-size:16px">Total paid</td>
          <td style="padding:8px 0;text-align:right;font-weight:700;font-size:16px">${formatNaira(order.total_amount)}</td></tr>
    </table>`;
}

function wrap(title, body) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#333">
    <div style="background:#1e1e1e;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0">
      <strong style="font-size:18px">JKT E-Commerce</strong>
    </div>
    <div style="border:1px solid #eee;border-top:0;padding:20px;border-radius:0 0 8px 8px">
      <h2 style="margin-top:0;font-size:20px">${title}</h2>
      ${body}
    </div>
  </div>`;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function sendOrderEmails(order) {
  const base = process.env.BASE_URL || "";
  const jobs = [];

  if (order.customer_email) {
    jobs.push(sendEmail(
      order.customer_email,
      `Payment received — order ${order.order_number}`,
      wrap("Thank you! Your payment was received.", `
        <p>Hi ${escapeHtml(order.customer_name || "there")},</p>
        <p>We've received your payment for order <strong>${escapeHtml(order.order_number)}</strong> and we're preparing it now.</p>
        ${itemsTable(order)}
        <p style="margin-top:16px"><strong>Delivery address:</strong><br>${escapeHtml(order.address)}</p>
        <p style="color:#6b7280;font-size:13px">Payment reference: ${escapeHtml(order.payment_reference || "-")}</p>
        <p><a href="${base}/products" style="color:#6f520c">Continue shopping</a></p>`)
    ));
  }

  const adminEmail = process.env.ADMIN_EMAIL || process.env.BREVO_FROM;
  if (adminEmail) {
    jobs.push(sendEmail(
      adminEmail,
      `💰 New paid order ${order.order_number} — ${formatNaira(order.total_amount)}`,
      wrap(`New paid order ${escapeHtml(order.order_number)}`, `
        <p><strong>${escapeHtml(order.customer_name)}</strong> · ${escapeHtml(order.customer_phone || "")} · ${escapeHtml(order.customer_email || "")}</p>
        <p>${escapeHtml(order.address)}</p>
        ${itemsTable(order)}
        <p><a href="${base}/orders/admin/${order.id}" style="color:#6f520c">Open order in admin</a></p>`)
    ));
  }

  await Promise.allSettled(jobs);
}

// ---------- Bank transfer ----------

const PAY_WINDOW_HOURS = Number(process.env.BANK_TRANSFER_HOURS) || 48;
const REMINDER_HOURS = Math.max(1, Math.floor(PAY_WINDOW_HOURS / 2));

/** Bank account customers pay into (set in .env). Null if not configured. */
function bankDetails() {
  const d = {
    bankName: process.env.BANK_NAME,
    accountNumber: process.env.BANK_ACCOUNT_NUMBER,
    accountName: process.env.BANK_ACCOUNT_NAME,
  };
  return d.bankName && d.accountNumber && d.accountName ? d : null;
}

function payByDate(order) {
  return new Date(new Date(order.created_at).getTime() + PAY_WINDOW_HOURS * 3600 * 1000);
}

function formatDate(d) {
  return d.toLocaleString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" });
}

function bankBox(order) {
  const bank = bankDetails();
  const amount = formatNaira(order.total_amount);
  if (!bank) {
    return `<p>Please reply to this email and we'll send you our account details to pay <strong>${amount}</strong>.</p>`;
  }
  return `
    <div style="background:#fafafa;border:1px solid #eee;border-radius:8px;padding:14px 16px;margin:16px 0">
      <p style="margin:0 0 8px;font-weight:700">Transfer ${amount} to:</p>
      <table style="font-size:14px;border-collapse:collapse">
        <tr><td style="padding:3px 16px 3px 0;color:#6b7280">Bank</td><td><strong>${escapeHtml(bank.bankName)}</strong></td></tr>
        <tr><td style="padding:3px 16px 3px 0;color:#6b7280">Account number</td><td><strong style="font-size:16px;letter-spacing:.05em">${escapeHtml(bank.accountNumber)}</strong></td></tr>
        <tr><td style="padding:3px 16px 3px 0;color:#6b7280">Account name</td><td><strong>${escapeHtml(bank.accountName)}</strong></td></tr>
        <tr><td style="padding:3px 16px 3px 0;color:#6b7280">Narration</td><td><strong>${escapeHtml(order.order_number)}</strong></td></tr>
      </table>
      <p style="margin:10px 0 0;font-size:13px;color:#6b7280">
        Please use <strong>${escapeHtml(order.order_number)}</strong> as the transfer narration so we can match your payment.
        Pay before <strong>${formatDate(payByDate(order))}</strong> or the order will be cancelled automatically.
      </p>
    </div>`;
}

/** Emails sent right after a bank-transfer order is placed. */
async function sendBankTransferPlacedEmails(order) {
  const base = process.env.BASE_URL || "";
  const jobs = [];

  if (order.customer_email) {
    jobs.push(sendEmail(
      order.customer_email,
      `Complete your payment — order ${order.order_number}`,
      wrap("Your order is reserved — please complete payment", `
        <p>Hi ${escapeHtml(order.customer_name || "there")},</p>
        <p>Thanks for your order <strong>${escapeHtml(order.order_number)}</strong>. To complete it, please make a bank transfer:</p>
        ${bankBox(order)}
        ${itemsTable(order).replace("Total paid", "Total due")}
        <p style="margin-top:16px">Once we confirm your payment we'll email your receipt and start preparing your order.</p>`)
    ));
  }

  const adminEmail = process.env.ADMIN_EMAIL || process.env.BREVO_FROM;
  if (adminEmail) {
    jobs.push(sendEmail(
      adminEmail,
      `🏦 New bank-transfer order ${order.order_number} — awaiting ${formatNaira(order.total_amount)}`,
      wrap(`Awaiting bank transfer: ${escapeHtml(order.order_number)}`, `
        <p><strong>${escapeHtml(order.customer_name)}</strong> · ${escapeHtml(order.customer_phone || "")} · ${escapeHtml(order.customer_email || "")}</p>
        <p>${escapeHtml(order.address)}</p>
        ${itemsTable(order).replace("Total paid", "Total due")}
        <p>Look for a transfer of <strong>${formatNaira(order.total_amount)}</strong> with narration <strong>${escapeHtml(order.order_number)}</strong>,
           then click <em>Mark paid</em>. It auto-cancels on ${formatDate(payByDate(order))} if unpaid.</p>
        <p><a href="${base}/orders/admin/manage" style="color:#6f520c">Open orders in admin</a></p>`)
    ));
  }

  await Promise.allSettled(jobs);
}

// ---------- Background job: reminders and expiry ----------

async function remindUnpaidOrders() {
  // Claim rows atomically so two server instances never email twice
  const { rows } = await pool.query(
    `UPDATE orders SET reminder_sent_at = NOW()
     WHERE payment_method = 'bank_transfer'
       AND payment_status = 'unpaid'
       AND status <> 'cancelled'
       AND deleted IS NOT TRUE
       AND reminder_sent_at IS NULL
       AND created_at < NOW() - make_interval(hours => $1)
       AND created_at > NOW() - make_interval(hours => $2)
     RETURNING id`,
    [REMINDER_HOURS, PAY_WINDOW_HOURS]
  );
  for (const { id } of rows) {
    const order = await loadOrder(id);
    if (!order?.customer_email) continue;
    await sendEmail(
      order.customer_email,
      `Reminder: payment pending for order ${order.order_number}`,
      wrap("Your order is still waiting for payment", `
        <p>Hi ${escapeHtml(order.customer_name || "there")},</p>
        <p>We haven't received payment for order <strong>${escapeHtml(order.order_number)}</strong> yet.</p>
        ${bankBox(order)}
        <p style="font-size:13px;color:#6b7280">Already paid? Just reply to this email with your transfer receipt.</p>`)
    ).catch(err => console.error("Reminder email failed:", err.message));
  }
  return rows.length;
}

async function expireUnpaidOrders() {
  const { rows } = await pool.query(
    `UPDATE orders SET status = 'cancelled', payment_status = 'expired'
     WHERE payment_status IN ('unpaid', 'failed')
       AND status = 'pending'
       AND created_at < NOW() - make_interval(hours => $1)
     RETURNING id, payment_method`,
    [PAY_WINDOW_HOURS]
  );
  // Only bank-transfer customers were told to pay later; abandoned online checkouts expire quietly
  for (const { id } of rows.filter(r => r.payment_method === "bank_transfer")) {
    const order = await loadOrder(id);
    if (!order?.customer_email) continue;
    await sendEmail(
      order.customer_email,
      `Order ${order.order_number} cancelled — payment not received`,
      wrap("Your order has been cancelled", `
        <p>Hi ${escapeHtml(order.customer_name || "there")},</p>
        <p>We didn't receive payment for order <strong>${escapeHtml(order.order_number)}</strong> within ${PAY_WINDOW_HOURS} hours, so it has been cancelled.</p>
        <p>If you've already paid, reply to this email with your receipt and we'll sort it out right away.</p>
        <p><a href="${process.env.BASE_URL || ""}/products" style="color:#6f520c">Shop again</a></p>`)
    ).catch(err => console.error("Cancellation email failed:", err.message));
  }
  return rows.length;
}

let jobTimer = null;
function startOrderJobs(intervalMs = 15 * 60 * 1000) {
  if (jobTimer) return;
  const run = async () => {
    try {
      const reminded = await remindUnpaidOrders();
      const expired = await expireUnpaidOrders();
      if (reminded || expired) console.log(`🧾 Order job: ${reminded} reminder(s), ${expired} expired`);
    } catch (err) {
      console.error("Order job failed:", err.message);
    }
  };
  run();
  jobTimer = setInterval(run, intervalMs);
  jobTimer.unref?.();
}

module.exports = {
  loadOrder,
  markOrderPaid,
  bankDetails,
  payByDate,
  sendBankTransferPlacedEmails,
  remindUnpaidOrders,
  expireUnpaidOrders,
  startOrderJobs,
  PAY_WINDOW_HOURS,
};
