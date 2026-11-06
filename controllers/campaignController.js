const pool = require("../utils/db");
const cloudinary = require("../utils/cloudinary");
const { withPricing, getActiveCampaigns, clearCampaignCache } = require("../utils/pricing");

const toIntArray = v =>
  (Array.isArray(v) ? v : v == null || v === "" ? [] : [v])
    .map(x => parseInt(x, 10))
    .filter(Number.isInteger);

function campaignParams(body) {
  const appliesTo = ["all", "categories", "products"].includes(body.applies_to) ? body.applies_to : "all";
  return {
    title: String(body.title || "").trim(),
    description: body.description || null,
    discount_type: body.discount_type === "fixed" ? "fixed" : "percent",
    value: Number(body.value),
    applies_to: appliesTo,
    category_ids: appliesTo === "categories" ? toIntArray(body.category_ids) : [],
    product_ids: appliesTo === "products" ? toIntArray(body.product_ids) : [],
    starts_at: body.starts_at || null,
    ends_at: body.ends_at || null,
    is_active: body.is_active === "on" || body.is_active === "true",
  };
}

function validate(p) {
  if (!p.title) return "Title is required";
  if (!(p.value > 0)) return "Discount value must be greater than 0";
  if (p.discount_type === "percent" && p.value >= 100) return "Percentage must be less than 100";
  if (p.applies_to === "categories" && !p.category_ids.length) return "Pick at least one category";
  if (p.applies_to === "products" && !p.product_ids.length) return "Pick at least one product";
  if (p.starts_at && p.ends_at && new Date(p.ends_at) <= new Date(p.starts_at)) return "End date must be after start date";
  return null;
}

async function uploadBanner(req) {
  if (!req.file?.path) return undefined;
  const result = await cloudinary.uploader.upload(req.file.path, { folder: "JKT-ecommerce/promotions" });
  return result.secure_url;
}

const back = (res, error) =>
  res.redirect("/admin/promotions" + (error ? "?error=" + encodeURIComponent(error) : ""));

// ---------- Admin ----------

exports.adminList = async (req, res) => {
  try {
    const [campaigns, categories, products] = await Promise.all([
      pool.query("SELECT * FROM promo_campaigns ORDER BY created_at DESC"),
      pool.query("SELECT id, name FROM categories ORDER BY name ASC"),
      pool.query("SELECT id, name, price, category_id FROM products ORDER BY name ASC"),
    ]);

    // How many products each campaign covers
    const counts = {};
    campaigns.rows.forEach(c => {
      counts[c.id] =
        c.applies_to === "all" ? products.rows.length
        : c.applies_to === "categories" ? products.rows.filter(p => (c.category_ids || []).includes(p.category_id)).length
        : (c.product_ids || []).length;
    });

    res.render("admin/promotions", {
      title: "Promotions | JKT E-Commerce",
      campaigns: campaigns.rows,
      categories: categories.rows,
      products: products.rows,
      counts,
      error: req.query.error || null,
      user: req.session.user,
    });
  } catch (err) {
    console.error("Error loading promotions:", err);
    res.status(500).send("Server error");
  }
};

exports.create = async (req, res) => {
  const p = campaignParams(req.body);
  const error = validate(p);
  if (error) return back(res, error);
  try {
    const banner = await uploadBanner(req);
    await pool.query(
      `INSERT INTO promo_campaigns
        (title, description, banner_url, discount_type, value, applies_to,
         category_ids, product_ids, starts_at, ends_at, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [p.title, p.description, banner || null, p.discount_type, p.value, p.applies_to,
       p.category_ids, p.product_ids, p.starts_at, p.ends_at, p.is_active]
    );
    clearCampaignCache();
    back(res);
  } catch (err) {
    console.error("Error creating campaign:", err);
    back(res, "Could not create promotion");
  }
};

exports.update = async (req, res) => {
  const p = campaignParams(req.body);
  const error = validate(p);
  if (error) return back(res, error);
  try {
    const banner = await uploadBanner(req);
    await pool.query(
      `UPDATE promo_campaigns SET
         title=$1, description=$2, banner_url=COALESCE($3, banner_url), discount_type=$4, value=$5,
         applies_to=$6, category_ids=$7, product_ids=$8, starts_at=$9, ends_at=$10, is_active=$11
       WHERE id=$12`,
      [p.title, p.description, banner || null, p.discount_type, p.value, p.applies_to,
       p.category_ids, p.product_ids, p.starts_at, p.ends_at, p.is_active, req.params.id]
    );
    clearCampaignCache();
    back(res);
  } catch (err) {
    console.error("Error updating campaign:", err);
    back(res, "Could not update promotion");
  }
};

exports.toggle = async (req, res) => {
  try {
    await pool.query("UPDATE promo_campaigns SET is_active = NOT is_active WHERE id = $1", [req.params.id]);
    clearCampaignCache();
    back(res);
  } catch (err) {
    console.error("Error toggling campaign:", err);
    back(res, "Could not update promotion");
  }
};

exports.remove = async (req, res) => {
  try {
    await pool.query("DELETE FROM promo_campaigns WHERE id = $1", [req.params.id]);
    clearCampaignCache();
    back(res);
  } catch (err) {
    console.error("Error deleting campaign:", err);
    back(res, "Could not delete promotion");
  }
};

// ---------- Public ----------

/** Short label for a campaign, e.g. "15% OFF" or "₦500 OFF". */
exports.discountLabel = c =>
  c.discount_type === "percent"
    ? `${Number(c.value)}% OFF`
    : `₦${Number(c.value).toLocaleString("en-NG")} OFF`;

exports.hotDeals = async (req, res) => {
  try {
    const campaigns = await getActiveCampaigns();
    const products = await pool.query(`
      SELECT products.*, categories.name AS category_name
      FROM products
      LEFT JOIN categories ON products.category_id = categories.id
      ORDER BY products.created_at DESC
    `);
    let deals = (await withPricing(products.rows)).filter(p => p.pricing.onSale);

    const selected = parseInt(req.query.campaign, 10);
    if (selected) deals = deals.filter(p => p.pricing.campaignId === selected);
    deals.sort((a, b) => b.pricing.percentOff - a.pricing.percentOff);

    res.render("public/promotions", {
      title: "Hot Deals | JKT E-Commerce",
      description: "Current promotions and discounted electronics components on JKT E-Commerce",
      keywords: "deals, discount, promo, sale, electronics, arduino, JKT",
      campaigns,
      deals,
      selected: selected || null,
      discountLabel: exports.discountLabel,
      user: req.session.user,
    });
  } catch (err) {
    console.error("Error loading hot deals:", err);
    res.status(500).send("Server error");
  }
};
