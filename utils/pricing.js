// Single source of truth for product prices, sales, campaigns and coupons.
// Every page and the cart/checkout use these helpers so the price a
// customer sees is always the price they are charged.
//
// Price rule: a product gets the LOWEST of
//   - its regular price
//   - its own sale price (if the sale is running)
//   - any running campaign that covers it
// Discounts never stack with each other. Coupons apply on top at checkout,
// unless a coupon is set to exclude items that are already discounted.
const pool = require("./db");

const round2 = n => Math.round(Number(n) * 100) / 100;

function inWindow(startsAt, endsAt, now) {
  if (startsAt && new Date(startsAt) > now) return false;
  if (endsAt && new Date(endsAt) <= now) return false;
  return true;
}

/** Is the product's own sale price active right now? */
function isSaleActive(product, now = new Date()) {
  const sale = Number(product.sale_price);
  const regular = Number(product.price);
  if (!product.sale_price || !(sale > 0) || !(sale < regular)) return false;
  return inWindow(product.sale_starts_at, product.sale_ends_at, now);
}

// ---------- Campaigns ----------

let campaignCache = { at: 0, rows: [] };
const CACHE_MS = 30 * 1000;

/** Active campaigns (cached briefly; call clearCampaignCache() after admin edits). */
async function getActiveCampaigns() {
  if (Date.now() - campaignCache.at < CACHE_MS) return campaignCache.rows;
  const { rows } = await pool.query(`
    SELECT * FROM promo_campaigns
    WHERE is_active = true
      AND (starts_at IS NULL OR starts_at <= NOW())
      AND (ends_at IS NULL OR ends_at > NOW())
    ORDER BY created_at DESC
  `);
  campaignCache = { at: Date.now(), rows };
  return rows;
}

function clearCampaignCache() {
  campaignCache = { at: 0, rows: [] };
}

function campaignCovers(c, product) {
  if (c.applies_to === "all") return true;
  if (c.applies_to === "categories") return (c.category_ids || []).includes(Number(product.category_id));
  if (c.applies_to === "products") return (c.product_ids || []).includes(Number(product.id));
  return false;
}

function campaignPrice(c, regular) {
  const p = c.discount_type === "percent"
    ? regular * (1 - Number(c.value) / 100)
    : regular - Number(c.value);
  return round2(p);
}

// ---------- Pricing ----------

/**
 * Price info for display and charging.
 * `campaigns` should be the result of getActiveCampaigns().
 */
function getPricing(product, now = new Date(), campaigns = []) {
  const original = round2(product.price || 0);
  let best = { price: original, source: null, label: null, endsAt: null, campaignId: null };

  if (isSaleActive(product, now)) {
    best = {
      price: round2(product.sale_price),
      source: "sale",
      label: "Sale",
      endsAt: product.sale_ends_at || null,
      campaignId: null,
    };
  }

  for (const c of campaigns) {
    if (!inWindow(c.starts_at, c.ends_at, now) || !campaignCovers(c, product)) continue;
    const p = campaignPrice(c, original);
    if (p > 0 && p < best.price) {
      best = { price: p, source: "campaign", label: c.title, endsAt: c.ends_at || null, campaignId: c.id };
    }
  }

  const onSale = best.price < original;
  return {
    price: best.price,
    original,
    onSale,
    percentOff: onSale ? Math.round((1 - best.price / original) * 100) : 0,
    source: onSale ? best.source : null,
    label: onSale ? best.label : null,
    campaignId: onSale ? best.campaignId : null,
    endsAt: onSale && best.endsAt ? new Date(best.endsAt).toISOString() : null,
  };
}

/** Attach `pricing` to each product row (mutates and returns the array). */
async function withPricing(products) {
  const campaigns = await getActiveCampaigns();
  const now = new Date();
  products.forEach(p => { p.pricing = getPricing(p, now, campaigns); });
  return products;
}

// ---------- Volume (bulk) pricing ----------

/** Map productId → tiers [{ min_qty, price }] sorted by min_qty. */
async function getTiers(productIds) {
  const map = new Map();
  if (!productIds.length) return map;
  const { rows } = await pool.query(
    "SELECT product_id, min_qty, price FROM product_price_tiers WHERE product_id = ANY($1::int[]) ORDER BY min_qty",
    [productIds]
  );
  rows.forEach(r => {
    if (!map.has(r.product_id)) map.set(r.product_id, []);
    map.get(r.product_id).push({ min_qty: Number(r.min_qty), price: round2(r.price) });
  });
  return map;
}

/**
 * Unit price for a quantity. Bulk tiers and sales/campaigns never stack:
 * the customer gets whichever unit price is lower.
 * Returns { price, bulk } where bulk is the tier used (or null).
 */
function unitPriceFor(pricing, tiers = [], qty = 1) {
  let best = { price: pricing.price, bulk: null };
  for (const t of tiers) {
    if (qty >= t.min_qty && t.price < best.price) best = { price: t.price, bulk: t };
  }
  return best;
}

/** Naira formatting used across views. */
function formatNaira(n) {
  return "₦" + Number(n || 0).toLocaleString("en-NG", { maximumFractionDigits: 2 });
}

// ---------- Coupons ----------

/**
 * Validate a coupon against the cart. Returns { coupon, discount } or { error }.
 * `items` (priced cart items) lets coupons that exclude sale items work.
 * `client` lets checkout run this inside a transaction (with row lock).
 */
async function evaluateCoupon(code, subtotal, { items = null, userId = null, email = null, client = pool, lock = false } = {}) {
  if (!code) return { error: "Enter a coupon code" };

  const { rows } = await client.query(
    `SELECT * FROM coupons WHERE UPPER(code) = UPPER($1) ${lock ? "FOR UPDATE" : ""}`,
    [String(code).trim()]
  );
  const c = rows[0];
  const now = new Date();

  if (!c || !c.is_active) return { error: "This coupon code is not valid" };
  if (c.starts_at && new Date(c.starts_at) > now) return { error: "This coupon is not active yet" };
  if (c.ends_at && new Date(c.ends_at) <= now) return { error: "This coupon has expired" };
  if (c.usage_limit != null && c.used_count >= c.usage_limit) return { error: "This coupon has reached its usage limit" };

  const minOrder = Number(c.min_order) || 0;
  if (subtotal < minOrder) {
    return { error: `Add ${formatNaira(minOrder - subtotal)} more to use this coupon (minimum order ${formatNaira(minOrder)})` };
  }

  if (c.per_user_limit != null && (userId || email)) {
    const used = await client.query(
      `SELECT COUNT(*)::int AS n FROM coupon_redemptions
       WHERE coupon_id = $1 AND (user_id = $2 OR ($3::text IS NOT NULL AND LOWER(email) = LOWER($3)))`,
      [c.id, userId, email]
    );
    if (used.rows[0].n >= c.per_user_limit) return { error: "You have already used this coupon" };
  }

  // Free-delivery coupons don't discount items; checkout waives the delivery fee
  if (c.discount_type === "free_shipping") {
    return { coupon: c, discount: 0, partial: false, freeShipping: true };
  }

  // Which part of the cart the coupon can discount
  let eligible = subtotal;
  if (c.allow_with_sale === false && items) {
    eligible = round2(items.filter(i => !i.on_sale).reduce((s, i) => s + i.price * i.quantity, 0));
    if (eligible <= 0) return { error: "This coupon can't be used on items that are already on sale" };
  }

  let discount = c.discount_type === "percent"
    ? eligible * (Number(c.value) / 100)
    : Number(c.value);
  if (c.max_discount != null) discount = Math.min(discount, Number(c.max_discount));
  discount = round2(Math.min(discount, eligible));

  return { coupon: c, discount, partial: eligible < subtotal };
}

// ---------- Cart ----------

/**
 * Re-price the session cart from the database (so expired/started sales and
 * campaigns and edited prices are respected), then apply the session coupon.
 * Returns a summary object; also updates cart totals in the session.
 */
async function priceCart(req) {
  const cart = req.session.cart || { items: [], totalQty: 0, totalPrice: 0 };
  req.session.cart = cart;

  if (cart.items.length) {
    const ids = cart.items.map(i => i.product_id);
    const { rows } = await pool.query("SELECT * FROM products WHERE id = ANY($1::int[])", [ids]);
    const byId = new Map(rows.map(p => [p.id, p]));
    const campaigns = await getActiveCampaigns();
    const tiers = await getTiers(ids);
    const now = new Date();

    // Drop items whose product was deleted
    cart.items = cart.items.filter(i => byId.has(i.product_id));
    cart.items.forEach(item => {
      const p = byId.get(item.product_id);
      const pr = getPricing(p, now, campaigns);
      const productTiers = tiers.get(p.id) || [];
      const unit = unitPriceFor(pr, productTiers, item.quantity);
      // Next tier the customer could reach, for an "add N more" hint
      const next = productTiers.find(t => t.min_qty > item.quantity && t.price < unit.price) || null;
      Object.assign(item, {
        name: p.name,
        image_url: p.image_url,
        price: unit.price,
        original_price: pr.original,
        on_sale: unit.price < pr.original,
        promo_label: unit.bulk ? `Bulk ${unit.bulk.min_qty}+` : pr.label,
        bulk_next: next && { min_qty: next.min_qty, price: next.price, add: next.min_qty - item.quantity },
      });
    });
  }

  const subtotal = round2(cart.items.reduce((s, i) => s + i.price * i.quantity, 0));
  const savings = round2(cart.items.reduce((s, i) => s + (i.original_price - i.price) * i.quantity, 0));
  cart.totalQty = cart.items.reduce((s, i) => s + i.quantity, 0);
  cart.totalPrice = subtotal;

  let coupon = null, discount = 0, couponError = null, partial = false;
  if (req.session.couponCode && subtotal > 0) {
    const result = await evaluateCoupon(req.session.couponCode, subtotal, {
      items: cart.items,
      userId: req.session.user?.id || null,
      email: req.session.user?.email || null,
    });
    if (result.error) couponError = result.error;
    else { coupon = result.coupon; discount = result.discount; partial = result.partial; }
  }

  return {
    items: cart.items,
    totalQty: cart.totalQty,
    subtotal,
    saleSavings: savings,
    couponCode: req.session.couponCode || null,
    coupon: coupon && {
      code: coupon.code,
      description: coupon.description,
      type: coupon.discount_type,
      value: Number(coupon.value),
      partial,
    },
    couponError,
    discount,
    freeShipping: coupon?.discount_type === "free_shipping",
    // Items total. Delivery is added at checkout once the state is known.
    total: round2(subtotal - discount),
  };
}

module.exports = {
  isSaleActive,
  getPricing,
  withPricing,
  getActiveCampaigns,
  clearCampaignCache,
  formatNaira,
  evaluateCoupon,
  priceCart,
  getTiers,
  unitPriceFor,
  round2,
};
