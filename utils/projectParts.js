// Project parts list + adding several products to the session cart at once
// (shared by "Add all to cart" on projects and "Buy these again" on orders).
const pool = require("./db");
const { withPricing, round2, getTiers, unitPriceFor } = require("./pricing");

/**
 * Add products to the session cart, capped to stock.
 * items: [{ product_id, quantity, name, image_url, price, stock }]
 * Returns { added: [names], skipped: ["Name (only N available)" | "Name"] }
 */
function addItemsToCart(req, items) {
  if (!req.session.cart) req.session.cart = { items: [], totalQty: 0, totalPrice: 0 };
  const cart = req.session.cart;
  const added = [], skipped = [];

  for (const p of items) {
    const inCart = cart.items.find(i => i.product_id === p.product_id);
    const already = inCart ? inCart.quantity : 0;
    const available = p.stock == null ? Infinity : Math.max(Number(p.stock) - already, 0);
    const qty = Math.min(p.quantity, available);
    if (qty <= 0) { skipped.push(p.name); continue; }
    if (inCart) inCart.quantity += qty;
    // Price is refreshed by priceCart() when the cart is shown
    else cart.items.push({
      product_id: p.product_id, name: p.name, image_url: p.image_url,
      price: Number(p.price), original_price: Number(p.price), quantity: qty,
    });
    added.push(p.name);
    if (qty < p.quantity) skipped.push(`${p.name} (only ${qty} available)`);
  }
  return { added, skipped };
}

/** A project's parts with live prices (sales/campaigns applied) and stock. */
async function getProjectParts(projectId) {
  const { rows } = await pool.query(
    `SELECT pp.id AS part_id, pp.quantity, pp.note, pp.sort_order,
            p.id, p.name, p.image_url, p.price, p.stock, p.category_id,
            p.sale_price, p.sale_starts_at, p.sale_ends_at
     FROM project_parts pp
     JOIN products p ON p.id = pp.product_id
     WHERE pp.project_id = $1
     ORDER BY pp.sort_order, pp.id`,
    [projectId]
  );
  await withPricing(rows);
  const tiers = await getTiers(rows.map(r => r.id));
  const parts = rows.map(r => {
    // Bulk tier for the kit quantity (never stacks with a sale; lower price wins)
    const unit = unitPriceFor(r.pricing, tiers.get(r.id) || [], r.quantity);
    const pricing = unit.price < r.pricing.price
      ? { ...r.pricing, price: unit.price, onSale: true, percentOff: Math.round((1 - unit.price / r.pricing.original) * 100), label: `Bulk ${unit.bulk.min_qty}+` }
      : r.pricing;
    return {
      ...r,
      pricing,
      inStock: r.stock == null || Number(r.stock) >= r.quantity,
      lineTotal: round2(pricing.price * r.quantity),
      lineOriginal: round2(pricing.original * r.quantity),
    };
  });
  return {
    parts,
    total: round2(parts.reduce((s, p) => s + p.lineTotal, 0)),
    savings: round2(parts.reduce((s, p) => s + (p.lineOriginal - p.lineTotal), 0)),
    allInStock: parts.every(p => p.inStock),
  };
}

/** Projects (active) that use a product, for "Used in these projects". */
async function projectsUsingProduct(productId) {
  const { rows } = await pool.query(
    `SELECT pr.id, pr.title, pr.thumbnail_image, pr.complexity_level
     FROM project_parts pp JOIN projects pr ON pr.id = pp.project_id
     WHERE pp.product_id = $1 AND pr.is_active IS NOT FALSE
     ORDER BY pr.is_featured DESC, pr.created_at DESC
     LIMIT 6`,
    [productId]
  );
  return rows;
}

module.exports = { addItemsToCart, getProjectParts, projectsUsingProduct };
