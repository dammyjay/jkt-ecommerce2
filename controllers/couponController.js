const pool = require("../utils/db");

function couponParams(body) {
  const num = v => (v === "" || v == null ? null : Number(v));
  const int = v => (v === "" || v == null ? null : parseInt(v, 10));
  return [
    String(body.code || "").trim().toUpperCase(),
    body.description || null,
    ["fixed", "free_shipping"].includes(body.discount_type) ? body.discount_type : "percent",
    body.discount_type === "free_shipping" ? 0 : num(body.value),
    num(body.min_order) || 0,
    num(body.max_discount),
    int(body.usage_limit),
    int(body.per_user_limit),
    body.starts_at || null,
    body.ends_at || null,
    body.is_active === "on" || body.is_active === "true",
    body.allow_with_sale === "on" || body.allow_with_sale === "true",
  ];
}

function validate(params) {
  const [code, , type, value] = params;
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) return "Code must be 3–40 letters, numbers, - or _";
  if (type !== "free_shipping" && !(value > 0)) return "Discount value must be greater than 0";
  if (type === "percent" && value > 100) return "Percentage cannot exceed 100";
  return null;
}

async function renderPage(res, req, extra = {}) {
  const { rows } = await pool.query(`
    SELECT c.*,
           COALESCE(SUM(r.discount_amount), 0) AS total_discount_given
    FROM coupons c
    LEFT JOIN coupon_redemptions r ON r.coupon_id = c.id
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `);
  res.render("admin/coupons", {
    title: "Coupons | JKT E-Commerce",
    coupons: rows,
    user: req.session.user,
    error: null,
    ...extra,
  });
}

exports.list = async (req, res) => {
  try {
    await renderPage(res, req, { error: req.query.error || null });
  } catch (err) {
    console.error("Error loading coupons:", err);
    res.status(500).send("Server error");
  }
};

exports.create = async (req, res) => {
  const params = couponParams(req.body);
  const error = validate(params);
  if (error) return res.redirect("/admin/coupons?error=" + encodeURIComponent(error));
  try {
    await pool.query(
      `INSERT INTO coupons
        (code, description, discount_type, value, min_order, max_discount,
         usage_limit, per_user_limit, starts_at, ends_at, is_active, allow_with_sale)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      params
    );
    res.redirect("/admin/coupons");
  } catch (err) {
    const msg = err.code === "23505" ? `Coupon ${params[0]} already exists` : "Could not create coupon";
    console.error("Error creating coupon:", err);
    res.redirect("/admin/coupons?error=" + encodeURIComponent(msg));
  }
};

exports.update = async (req, res) => {
  const params = couponParams(req.body);
  const error = validate(params);
  if (error) return res.redirect("/admin/coupons?error=" + encodeURIComponent(error));
  try {
    await pool.query(
      `UPDATE coupons SET
         code=$1, description=$2, discount_type=$3, value=$4, min_order=$5, max_discount=$6,
         usage_limit=$7, per_user_limit=$8, starts_at=$9, ends_at=$10, is_active=$11, allow_with_sale=$12
       WHERE id=$13`,
      [...params, req.params.id]
    );
    res.redirect("/admin/coupons");
  } catch (err) {
    const msg = err.code === "23505" ? `Coupon ${params[0]} already exists` : "Could not update coupon";
    console.error("Error updating coupon:", err);
    res.redirect("/admin/coupons?error=" + encodeURIComponent(msg));
  }
};

exports.toggle = async (req, res) => {
  try {
    await pool.query("UPDATE coupons SET is_active = NOT is_active WHERE id = $1", [req.params.id]);
    res.redirect("/admin/coupons");
  } catch (err) {
    console.error("Error toggling coupon:", err);
    res.status(500).send("Server error");
  }
};

exports.remove = async (req, res) => {
  try {
    await pool.query("DELETE FROM coupons WHERE id = $1", [req.params.id]);
    res.redirect("/admin/coupons");
  } catch (err) {
    console.error("Error deleting coupon:", err);
    res.status(500).send("Server error");
  }
};
